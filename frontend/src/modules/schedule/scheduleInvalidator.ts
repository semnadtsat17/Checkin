/**
 * scheduleInvalidator.ts
 *
 * Module-level pub-sub that lets any page signal "schedule data changed".
 *
 * Usage:
 *   Admin page — calls invalidateScheduleCache() after saving/publishing.
 *   Employee hook (useResolvedSchedule) — subscribes; drops its cache entry
 *   and refetches when notified.
 *
 * Works across all mounted instances in the same browser tab.
 * Cross-tab invalidation is handled separately via localStorage events
 * (existing 'schedule-invalidate' key written by EmployeesPage).
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Subscribe to schedule invalidation events.
 * Returns an unsubscribe function; pass it to useEffect's cleanup.
 */
export function subscribeToScheduleInvalidation(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Notify all mounted schedule views that their cached data is stale.
 * Call this after any mutation that changes employee-visible schedule data:
 *   - scheduleApi.upsertDays (save)
 *   - scheduleApi.publishSchedule (publish)
 */
export function invalidateScheduleCache(): void {
  listeners.forEach((fn) => fn());
}
