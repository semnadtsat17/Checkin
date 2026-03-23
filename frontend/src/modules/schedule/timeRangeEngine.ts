/**
 * Time Range Engine — UI Slot Computation Layer
 *
 * Converts the absolute-Date blocked ranges from rangeEngine.ts into the
 * per-slot disabled state needed by TimePicker.tsx.
 *
 * This file is the ONLY place that translates between HH:mm dropdown slots
 * and the domain's TimeRange model.  No page should implement its own
 * slot-blocking logic.
 *
 * All functions are pure — no React imports, no async, O(n) per call.
 *
 * Import chain:
 *   rangeEngine.ts  ←  timeRangeEngine.ts  ←  TimePicker.tsx
 *                                           ←  ExtraWorkModal
 */

import {
  rangesOverlap,
  toAbsoluteDate,
  type TimeRange,
  type RangeSource,
} from './rangeEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockReason = 'OVERLAP_MAIN' | 'OVERLAP_EXTRA' | 'INVALID_ORDER';

export interface SlotState {
  value:    string;         // HH:mm
  disabled: boolean;
  reason?:  BlockReason;
}

export interface TimeRangeEngine {
  /** Allowed start-time slots — memoizable, depends only on `date` + `blocked`. */
  startSlots: SlotState[];
  /**
   * Allowed end-time slots for a given startTime (HH:mm).
   * Pure — safe to call every render once the engine object is stable.
   */
  endSlots(startTime: string): SlotState[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate evenly-spaced HH:mm slots covering 00:00 – (24h - step).
 * Default: 30-minute steps → 48 slots.
 */
export function buildSlots(stepMinutes = 30): string[] {
  const slots: string[] = [];
  for (let total = 0; total < 24 * 60; total += stepMinutes) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return slots;
}

/** Map a TimeRange source to the UI block reason. */
function reasonFor(source: RangeSource): BlockReason {
  return source === 'EXTRA_WORK' ? 'OVERLAP_EXTRA' : 'OVERLAP_MAIN';
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Compute allowed start and end time slots for an OT entry on `date`.
 *
 * @param date     Calendar date of the OT entry — YYYY-MM-DD.
 *                 Used to convert HH:mm slots to absolute Dates so that
 *                 cross-day shifts (started the previous day) are correctly
 *                 compared against in-day slots.
 * @param blocked  All TimeRanges that must not be overlapped.
 *                 Build this with buildWorkingRanges() + apiRangesToAbsolute()
 *                 from rangeEngine.ts.  Include EXTRA_WORK ranges for other
 *                 OT entries on the same day.
 *                 Future leave ranges → source 'FUTURE_RESERVED', no code change.
 * @param stepMinutes  Slot granularity — must match TimePicker rendering.
 *
 * Usage:
 *   const engine = computeAllowedTimeRanges(date, blockedRanges);
 *   <StartPicker slots={engine.startSlots} />
 *   <EndPicker   slots={engine.endSlots(selectedStart)} />
 */
export function computeAllowedTimeRanges(
  date:         string,
  blocked:      TimeRange[],
  stepMinutes = 30
): TimeRangeEngine {
  const slots = buildSlots(stepMinutes);

  // ── Start slots ─────────────────────────────────────────────────────────────
  //
  // A start slot `s` is blocked when placing an OT range there guarantees
  // overlap with some blocked range regardless of end time chosen.
  //
  // Condition:  abs(s) is inside or at the start of some blocked range r
  //   r.start <= abs(s) < r.end
  //
  // Why `r.start <= abs(s)`:
  //   If abs(s) == r.start, every end > abs(s) satisfies end > r.start AND
  //   abs(s) < r.end — so overlap is certain.
  //
  // Why the end boundary abs(s) == r.end is safe:
  //   [r.end, anything] vs [r.start, r.end]
  //   → r.end < r.end is FALSE → no overlap ✓
  const startSlots: SlotState[] = slots.map((slot) => {
    const slotAbs = toAbsoluteDate(date, slot);
    for (const r of blocked) {
      if (slotAbs >= r.start && slotAbs < r.end) {
        return { value: slot, disabled: true, reason: reasonFor(r.source) };
      }
    }
    return { value: slot, disabled: false };
  });

  // ── End slots (factory) ──────────────────────────────────────────────────────
  //
  // Called per-render with current startTime — pure, no closure over mutable state.
  // Uses rangesOverlap from rangeEngine — the single overlap truth.
  function endSlots(startTime: string): SlotState[] {
    const startAbs = toAbsoluteDate(date, startTime);

    return slots.map((slot) => {
      const slotAbs = toAbsoluteDate(date, slot);

      // RULE: end must be strictly after start (same-day OT only)
      if (slotAbs <= startAbs) {
        return { value: slot, disabled: true, reason: 'INVALID_ORDER' };
      }

      // Candidate OT range for this (start, end) pair
      const candidate: TimeRange = { start: startAbs, end: slotAbs, source: 'EXTRA_WORK' };

      // Check against every blocked range using the root-truth overlap function
      for (const r of blocked) {
        if (rangesOverlap(candidate, r)) {
          return { value: slot, disabled: true, reason: reasonFor(r.source) };
        }
      }

      return { value: slot, disabled: false };
    });
  }

  return { startSlots, endSlots };
}

// ─── Pre-built fallback ───────────────────────────────────────────────────────

/**
 * All slots disabled with INVALID_ORDER — returned as the end-slot list when
 * no startTime has been chosen yet.  Built once at module load; safe to share.
 */
export const NO_START_END_SLOTS: SlotState[] = buildSlots(30).map((v) => ({
  value:    v,
  disabled: true,
  reason:   'INVALID_ORDER' as const,
}));
