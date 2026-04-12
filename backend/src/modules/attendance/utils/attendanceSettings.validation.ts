/**
 * attendanceSettings.validation.ts
 *
 * Zod schema for AttendanceSettings — validates any untrusted payload
 * (e.g. PATCH /api/org-settings request body) before it reaches business logic.
 *
 * Exported type `AttendanceSettings` is inferred from the schema so the
 * type and the runtime validation are always in sync.
 */
import { z } from 'zod';

// ─── Reusable primitives ──────────────────────────────────────────────────────

/** Accepts only "HH:mm" strings (00:00 – 23:59). */
const HHmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm format (00:00–23:59)');

const NonNegativeInt = z
  .number()
  .int()
  .min(0, 'Must be >= 0');

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const WorkScheduleSchema = z
  .object({
    startTime: HHmm,
    endTime:   HHmm,
    flexible:  z.boolean(),
  })
  .refine(
    ({ startTime, endTime }) => {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      return eh * 60 + em > sh * 60 + sm;
    },
    { message: 'endTime must be later than startTime', path: ['endTime'] },
  );

const LateRuleSchema = z.object({
  graceMinutes: NonNegativeInt,
});

const EarlyLeaveRuleSchema = z.object({
  graceMinutes: NonNegativeInt,
});

const OtRuleSchema = z.object({
  enabled:            z.boolean(),
  startAfterMinutes:  NonNegativeInt,
  requireApproval:    z.boolean(),
});

const LocationRuleSchema = z.object({
  enabled:       z.boolean(),
  radiusMeters:  z.number().positive('radiusMeters must be > 0'),
});

const PhotoRuleSchema = z.object({
  requireCheckInPhoto:  z.boolean(),
  requireCheckOutPhoto: z.boolean(),
});

const HrReportSchema = z.object({
  imageMode: z.enum(['ALWAYS', 'ON_DEMAND', 'OFF']),
});

// ─── Root schema ─────────────────────────────────────────────────────────────

export const AttendanceSettingsSchema = z.object({
  mode:                   z.enum(['SIMPLE', 'FULL']),
  requireManagerApproval: z.boolean(),
  workSchedule:           WorkScheduleSchema,
  lateRule:               LateRuleSchema,
  earlyLeaveRule:         EarlyLeaveRuleSchema,
  otRule:                 OtRuleSchema,
  locationRule:           LocationRuleSchema,
  photoRule:              PhotoRuleSchema,
  hrReport:               HrReportSchema,
});

// ─── Inferred TypeScript type ─────────────────────────────────────────────────

/** Use this type everywhere that previously would have held a raw object. */
export type AttendanceSettings = z.infer<typeof AttendanceSettingsSchema>;
