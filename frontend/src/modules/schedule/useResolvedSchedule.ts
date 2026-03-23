/**
 * useResolvedSchedule — single data-fetching authority for employee schedule views.
 *
 * Responsibilities:
 *   - Fetches /api/schedules/my-calendar for the given month.
 *   - Normalises ResolvedCalendarDay[] → ResolvedDay[] (single canonical shape).
 *   - Maintains a module-level TTL cache (5 min) so switching months is instant.
 *   - Subscribes to invalidateScheduleCache() — auto-refetches when the admin
 *     saves or publishes without requiring a page reload.
 *   - Exposes refresh() for manual refetch (window focus, storage events).
 *   - Exposes invalidate() so callers can trigger cross-view invalidation.
 *
 * CONSTRAINT: this hook calls ONLY scheduleApi.myCalendar.
 * Working time is NEVER computed client-side — it comes from the backend resolver.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { scheduleApi }                              from '../../api/schedules';
import type { ResolvedCalendarDay }                 from '../../api/schedules';
import {
  subscribeToScheduleInvalidation,
  invalidateScheduleCache,
}                                                   from './scheduleInvalidator';
import type { ResolvedDay }                         from './types';

// ─── Module-level TTL cache ────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  days: ResolvedDay[];
  ts:   number;
}

const dayCache = new Map<string, CacheEntry>();

function readCache(month: string): ResolvedDay[] | null {
  const entry = dayCache.get(month);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) {
    dayCache.delete(month);
    return null;
  }
  return entry.days;
}

function writeCache(month: string, days: ResolvedDay[]): void {
  dayCache.set(month, { days, ts: Date.now() });
}

/**
 * Drop every cached month.  Call after any mutation that changes holiday policy
 * (toggle, delete, create, load presets) so the next fetch is always fresh.
 * Unlike invalidateScheduleCache() this works even when no hook is mounted.
 */
export function clearAllScheduleCache(): void {
  dayCache.clear();
}

// ─── Normaliser ───────────────────────────────────────────────────────────────

/**
 * Maps one ResolvedCalendarDay to ResolvedDay.
 *
 * patternType is inferred from the 'source' field:
 *   'pattern'            → WEEKLY_WORKING_TIME (backend only emits this for WEEKLY depts)
 *   'published' | 'empty'→ SHIFT_TIME
 *
 * This is safe because resolveMyCalendar() in schedule.service.ts always sets
 * source === 'pattern' for every WEEKLY_WORKING_TIME day and never for SHIFT days.
 */
function normalise(d: ResolvedCalendarDay): ResolvedDay {
  const day: ResolvedDay = {
    date:        d.date,
    patternType: d.source === 'pattern' ? 'WEEKLY_WORKING_TIME' : 'SHIFT_TIME',
    isHoliday:   !!d.holiday,
    holidayName: d.holiday?.name,
    workingTime: d.weeklyTime,
    isDayOff:    d.isDayOff,
    shiftCodes:  d.shiftCodes,
    shifts:      d.shifts,
  };
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    console.log('[resolved-day]', day);
  }
  return day;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface UseResolvedScheduleResult {
  /** Resolved days for the current month.  Empty while loading for the first time. */
  days:       ResolvedDay[];
  loading:    boolean;
  /** Force an immediate cache-bypassing refetch. */
  refresh:    () => void;
  /**
   * Broadcast a global invalidation signal to all mounted useResolvedSchedule
   * instances in this tab.  Call from write operations (save, publish).
   */
  invalidate: () => void;
}

export function useResolvedSchedule(month: string): UseResolvedScheduleResult {
  const [days,    setDays]    = useState<ResolvedDay[]>(() => readCache(month) ?? []);
  const [loading, setLoading] = useState(false);

  // Incrementing tick triggers a re-fetch inside the effect.
  const [tick, setTick] = useState(0);
  // When true, the next fetch bypasses the TTL cache.
  const bypassRef = useRef(false);

  const fetchData = useCallback(async (bypass: boolean) => {
    if (!bypass) {
      const cached = readCache(month);
      if (cached) {
        setDays(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const raw        = await scheduleApi.myCalendar({ month });
      const normalised = raw.map(normalise);
      writeCache(month, normalised);
      setDays(normalised);
    } catch {
      // Silent — stale data (if any) remains visible.
    } finally {
      setLoading(false);
    }
  }, [month]);

  // Fetch on mount and whenever month or tick changes.
  useEffect(() => {
    const bypass     = bypassRef.current;
    bypassRef.current = false;
    fetchData(bypass);
  }, [fetchData, tick]);

  // Subscribe to global invalidation (e.g. admin saves or publishes).
  useEffect(() => {
    return subscribeToScheduleInvalidation(() => {
      dayCache.delete(month);
      bypassRef.current = true;
      setTick((t) => t + 1);
    });
  }, [month]);

  const refresh = useCallback(() => {
    bypassRef.current = true;
    setTick((t) => t + 1);
  }, []);

  const invalidate = useCallback(() => {
    invalidateScheduleCache();
  }, []);

  return { days, loading, refresh, invalidate };
}
