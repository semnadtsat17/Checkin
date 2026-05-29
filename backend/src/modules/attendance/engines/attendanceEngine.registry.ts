/**
 * attendanceEngine.registry.ts
 *
 * Single source of truth for engine selection.
 *
 * This is the ONLY file in the entire codebase that knows two attendance
 * engines exist.  Everything above it (processor, service, routes) is
 * mode-agnostic.  Everything below it (the engines) is also mode-agnostic.
 *
 * Switching mode at runtime:
 *   orgSettings.runtime subscribes to ORG_SETTINGS_UPDATED and updates its
 *   in-memory cache.  Because getAttendanceEngine() calls isSimpleMode() on
 *   every invocation (no local cache), the engine returned by the next
 *   check-in call reflects the new mode immediately — zero restart required.
 *
 * Adding a new mode:
 *   1. Create myMode.engine.ts implementing AttendanceEngine.
 *   2. Add a branch here.
 *   That's it — the processor, service, and routes remain untouched.
 */
import type { AttendanceEngine } from './attendance.engine';
import { normalAttendanceEngine } from './normalAttendance.engine';
import { simpleAttendanceEngine }  from './simpleAttendance.engine';
import { getEffectiveBranchSettings } from '../../branch-settings/branchSettings.runtime';

/**
 * Returns the AttendanceEngine that matches the branch's attendanceMode.
 * Defaults to normalAttendanceEngine when no branchId is provided.
 */
export function getAttendanceEngine(branchId?: string): AttendanceEngine {
  if (!branchId) return normalAttendanceEngine;
  const mode = getEffectiveBranchSettings(branchId).attendanceMode;
  return mode === 'SIMPLE' ? simpleAttendanceEngine : normalAttendanceEngine;
}
