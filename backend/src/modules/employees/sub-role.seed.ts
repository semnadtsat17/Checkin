/**
 * Default SubRole templates.
 * Seeded once on first server startup when sub_roles.json is empty.
 *
 * Template 1 — 2-shift (D/N, 12 h each)
 *   D  08:00–20:00   กะกลางวัน
 *   N  20:00–08:00   กะกลางคืน  (overnight)
 *
 * Template 2 — 3-shift (ช/บ/ด, 8 h each)
 *   ช  08:00–16:00   กะเช้า
 *   บ  16:00–00:00   กะบ่าย      (ends at midnight)
 *   ด  00:00–08:00   กะดึก       (starts at midnight)
 */
import { subRoleService } from './sub-role.service';

export function seedSubRoles(): void {
  // Guard: only seed when the collection is empty
  if (subRoleService.findAll().length > 0) return;

  // ── Template 1: 2-shift ────────────────────────────────────────────────────
  subRoleService.create({
    nameTh:              'เวรสองกะ (ด-น)',
    nameEn:              '2-Shift (D/N)',
    forRole:             'employee',
    monthlyWorkingHours: 240,   // 20 days × 12 h
    shifts: [
      {
        code:          'D',
        nameTh:        'กะกลางวัน',
        nameEn:        'Day Shift',
        startTime:     '08:00',
        endTime:       '20:00',
        isOvernight:   false,
        breakMinutes:  60,
      },
      {
        code:          'N',
        nameTh:        'กะกลางคืน',
        nameEn:        'Night Shift',
        startTime:     '20:00',
        endTime:       '08:00',   // crosses midnight
        isOvernight:   true,
        breakMinutes:  60,
      },
    ],
  });

  // ── Template 2: 3-shift ────────────────────────────────────────────────────
  subRoleService.create({
    nameTh:              'เวรสามกะ (ช-บ-ด)',
    nameEn:              '3-Shift (Morning/Afternoon/Night)',
    forRole:             'employee',
    monthlyWorkingHours: 240,   // 30 days × 8 h
    shifts: [
      {
        code:          'ช',
        nameTh:        'กะเช้า',
        nameEn:        'Morning Shift',
        startTime:     '08:00',
        endTime:       '16:00',
        isOvernight:   false,
        breakMinutes:  60,
      },
      {
        code:          'บ',
        nameTh:        'กะบ่าย',
        nameEn:        'Afternoon Shift',
        startTime:     '16:00',
        endTime:       '00:00',   // ends exactly at midnight
        isOvernight:   false,
        breakMinutes:  60,
      },
      {
        code:          'ด',
        nameTh:        'กะดึก',
        nameEn:        'Night Shift',
        startTime:     '00:00',   // starts at midnight
        endTime:       '08:00',
        isOvernight:   false,
        breakMinutes:  60,
      },
    ],
  });

  console.log('[seed] SubRole defaults created (2-shift, 3-shift)');
}
