/**
 * snapTimeEngine.ts
 *
 * Pure-function Snap Time Engine.
 *
 * Responsibility:
 *   Given a list of work segments (each with a start and end time string in
 *   HH:mm format) and an optional gap tolerance, produce a deduplicated,
 *   sorted list of merged "snap windows" that an employee is eligible to
 *   check in against.
 *
 * Merge rule:
 *   Two adjacent segments A and B are merged when:
 *     B.startMinutes - A.endMinutes <= continuousGapMinutes
 *   (i.e. gap of 0 means touching segments only; gap of 30 allows up to a
 *   30-minute break between segments to still be treated as one window)
 *
 * No imports from org-settings, attendance.service, or any stateful module —
 * this file must remain a pure transformation with zero side effects.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

/** A single work segment provided to the engine. */
export interface WorkSegment {
  /** HH:mm — start of the segment (same calendar day). */
  startTime: string;
  /** HH:mm — end of the segment.  "00:00" treated as 24:00 (midnight end). */
  endTime: string;
}

/** A merged snap window produced by the engine. */
export interface SnapWindow {
  /** HH:mm — earliest start among merged segments. */
  startTime: string;
  /** HH:mm — latest end among merged segments. */
  endTime: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Convert HH:mm to an integer number of minutes since midnight.
 * Special case: "00:00" is returned as 1440 (= 24 * 60) when it appears as
 * an *end* time, so that a midnight-end segment sorts after all daytime
 * segments.  The caller is responsible for passing the correct context.
 */
function toMinutes(hhmm: string, treatZeroAsMidnight = false): number {
  const [h, m] = hhmm.split(':').map(Number);
  const result = h * 60 + m;
  if (result === 0 && treatZeroAsMidnight) return 1440;
  return result;
}

/**
 * Convert integer minutes-since-midnight back to HH:mm.
 * 1440 (midnight sentinel) is returned as "00:00".
 */
function fromMinutes(minutes: number): string {
  const clamped = minutes % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Core export ─────────────────────────────────────────────────────────────

/**
 * Build a list of merged snap windows from an array of work segments.
 *
 * @param segments             Raw work segments (may be unsorted, may overlap).
 * @param continuousGapMinutes Maximum gap (minutes) that still triggers a merge.
 *                             Defaults to 0 (touching segments only).
 * @returns                    Sorted, merged snap windows — never overlapping.
 *
 * Edge cases:
 *   - Empty input  → empty output.
 *   - Single entry → returned as-is (after normalisation).
 *   - Segments with identical start/end → treated as zero-duration and merged.
 */
export function buildSnapWindows(
  segments: WorkSegment[],
  continuousGapMinutes = 0,
): SnapWindow[] {
  if (segments.length === 0) return [];

  // 1. Convert to absolute minutes, normalising midnight-end sentinel
  const absolutes = segments.map((s) => ({
    start: toMinutes(s.startTime, false),
    end:   toMinutes(s.endTime,   true),   // "00:00" end → 1440
  }));

  // 2. Sort by start time ascending, then by end time descending (so wider
  //    windows absorb narrower ones during the merge pass)
  absolutes.sort((a, b) => a.start !== b.start ? a.start - b.start : b.end - a.end);

  // 3. Greedy interval merge
  const merged: Array<{ start: number; end: number }> = [];

  for (const seg of absolutes) {
    if (merged.length === 0) {
      merged.push({ ...seg });
      continue;
    }

    const last = merged[merged.length - 1];
    const gap  = seg.start - last.end;

    if (gap <= continuousGapMinutes) {
      // Merge: extend the current window if this segment reaches further
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }

  // 4. Convert back to HH:mm strings
  return merged.map((w) => ({
    startTime: fromMinutes(w.start),
    endTime:   fromMinutes(w.end),
  }));
}
