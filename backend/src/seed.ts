/**
 * seed.ts — Initial data bootstrapper
 *
 * Creates the minimum data set needed to start using the system:
 *   1. Branch        (สาขาหลัก)
 *   2. BranchSettings (defaults for the branch)
 *   3. OrgInfo       (organisation name)
 *   4. Department    (แผนกทั่วไป — placeholder)
 *   5. super_admin   (admin@hospital.local / Admin1234)
 *
 * Guard: each section is a no-op when data already exists.
 * Safe to call on every server start.
 */
import bcrypt from 'bcryptjs';
import { JsonRepository } from './shared/repository/JsonRepository';
import type { IRepository } from './shared/repository/IRepository';
import type {
  Branch, BranchSettings, OrgInfo, Department,
  WorkSchedulePattern, HolidayType, HolidayDate,
} from '@hospital-hr/shared';
import type { UserRecord } from './modules/employees/employee.service';
import { BRANCH_SETTINGS_DEFAULTS } from './modules/branch-settings/branchSettings.runtime';
import { THAI_PUBLIC_HOLIDAY_PRESETS } from './modules/holidays/holiday.service';

const SALT_ROUNDS = 10;

// ─── Stores ───────────────────────────────────────────────────────────────────

const branchStore:   IRepository<Branch>              = new JsonRepository<Branch>('branches');
const bsStore:       IRepository<BranchSettings>       = new JsonRepository<BranchSettings>('branch_settings');
const orgStore:      IRepository<OrgInfo>               = new JsonRepository<OrgInfo>('org_info');
const deptStore:     IRepository<Department>            = new JsonRepository<Department>('departments');
const employeeStore: IRepository<UserRecord>            = new JsonRepository<UserRecord>('employees');
const wspStore:      IRepository<WorkSchedulePattern>   = new JsonRepository<WorkSchedulePattern>('sub_roles');
const htStore:       IRepository<HolidayType>           = new JsonRepository<HolidayType>('holiday_types');
const hdStore:       IRepository<HolidayDate>           = new JsonRepository<HolidayDate>('holiday_dates');

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function seedInitialData(): Promise<void> {
  // ── 1. Branch ────────────────────────────────────────────────────────────────
  let branch = branchStore.findOne(() => true);
  if (!branch) {
    branch = branchStore.create({
      nameTh:   'สาขาหลัก',
      nameEn:   'Main Branch',
      province: 'กรุงเทพมหานคร',
      isActive: true,
    } as Omit<Branch, 'id' | 'createdAt' | 'updatedAt'>);
    console.log(`[seed] Branch created: ${branch.id} (${branch.nameTh})`);
  }

  // ── 2. BranchSettings ────────────────────────────────────────────────────────
  const bsExists = bsStore.findOne((s) => s.branchId === branch!.id);
  if (!bsExists) {
    bsStore.create({
      branchId: branch.id,
      ...BRANCH_SETTINGS_DEFAULTS,
    } as Omit<BranchSettings, 'id' | 'createdAt' | 'updatedAt'>);
    console.log(`[seed] BranchSettings created for branch ${branch.id}`);
  }

  // ── 3. OrgInfo ───────────────────────────────────────────────────────────────
  const orgExists = orgStore.findOne(() => true);
  if (!orgExists) {
    orgStore.create({
      nameTh: 'โรงพยาบาล',
      nameEn: 'Hospital',
    } as Omit<OrgInfo, 'id' | 'createdAt' | 'updatedAt'>);
    console.log('[seed] OrgInfo created');
  }

  // ── 4. Department ─────────────────────────────────────────────────────────────
  let dept = deptStore.findOne((d) => d.branchId === branch!.id);
  if (!dept) {
    dept = deptStore.create({
      branchId:                   branch.id,
      nameTh:                     'แผนกทั่วไป',
      nameEn:                     'General',
      isActive:                   true,
      additionalWorkApprovalChain: 'manager_only',
    } as Omit<Department, 'id' | 'createdAt' | 'updatedAt'>);
    console.log(`[seed] Department created: ${dept.id} (${dept.nameTh})`);
  }

  // ── 5. Default WorkSchedulePattern (08:00–17:00 day shift) ──────────────────
  let wsp = wspStore.findOne((w) => w.branchId === branch!.id);
  if (!wsp) {
    wsp = wspStore.create({
      branchId:            branch.id,
      nameTh:              'กะปกติ (08:00–17:00)',
      nameEn:              'Day Shift (08:00–17:00)',
      forRole:             'employee',
      type:                'SHIFT_TIME',
      monthlyWorkingHours: 160,
      isActive:            true,
      shifts: [
        {
          code:         'D',
          nameTh:       'กะกลางวัน',
          nameEn:       'Day',
          startTime:    '08:00',
          endTime:      '17:00',
          isOvernight:  false,
          breakMinutes: 60,
        },
      ],
    } as Omit<WorkSchedulePattern, 'id' | 'createdAt' | 'updatedAt'>);
    console.log(`[seed] WorkSchedulePattern created: ${wsp.id} (${wsp.nameTh})`);
  }

  // ── 6. Default HolidayType + Thai public holidays ─────────────────────────
  let ht = htStore.findOne((h) => h.branchId === branch!.id);
  if (!ht) {
    ht = htStore.create({
      branchId: branch.id,
      name:     'วันหยุดราชการไทย',
    } as Omit<HolidayType, 'id' | 'createdAt' | 'updatedAt'>);
    console.log(`[seed] HolidayType created: ${ht.id} (${ht.name})`);

    // Seed Thai public holiday presets for this type
    for (const preset of THAI_PUBLIC_HOLIDAY_PRESETS) {
      hdStore.create({
        typeId:  ht.id,
        name:    preset.name,
        date:    preset.date,
        enabled: true,
      } as Omit<HolidayDate, 'id' | 'createdAt' | 'updatedAt'>);
    }
    console.log(`[seed] Seeded ${THAI_PUBLIC_HOLIDAY_PRESETS.length} Thai public holidays`);

    // Link the default department to this holiday type
    if (dept) {
      deptStore.updateById(dept.id, { holidayTypeId: ht.id });
    }
  }

  // ── 7. super_admin ────────────────────────────────────────────────────────────
  const adminExists = employeeStore.findOne((u) => u.role === 'super_admin');
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin1234', SALT_ROUNDS);
    const admin = employeeStore.create({
      firstNameTh:           'ผู้ดูแล',
      lastNameTh:            'ระบบ',
      firstName:             'System',
      lastName:              'Admin',
      email:                 'admin@hospital.local',
      role:                  'super_admin',
      employeeCode:          'ADMIN-0001',
      departmentId:          dept.id,
      branchId:              branch.id,
      isActive:              true,
      passwordHash,
      mustChangePassword:    false,
      workSchedulePatternId: wsp.id,
    } as Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>);
    console.log(`[seed] super_admin created: ${admin.email} / Admin1234`);
  }

  console.log('[seed] Done.');
}
