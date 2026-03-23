import type { HolidayType, HolidayDate, Department, UserRole } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import { hasPermission } from '../../core/permissions';

// ─── Thai public holiday presets ──────────────────────────────────────────────
//
// Fixed-date recurring holidays only (MM-DD anchor).
// Lunar-based holidays (Makha Bucha, Visakha Bucha, Asahna Bucha) are omitted
// because their MM-DD position changes each year; HR should add those manually.

export const THAI_PUBLIC_HOLIDAY_PRESETS: ReadonlyArray<{ name: string; date: string }> = [
  { date: '01-01', name: 'วันขึ้นปีใหม่' },
  { date: '04-06', name: 'วันจักรี' },
  { date: '04-13', name: 'วันสงกรานต์' },
  { date: '04-14', name: 'วันสงกรานต์ (วันครอบครัว)' },
  { date: '04-15', name: 'วันสงกรานต์' },
  { date: '05-01', name: 'วันแรงงานแห่งชาติ' },
  { date: '05-04', name: 'วันฉัตรมงคล' },
  { date: '07-28', name: 'วันเฉลิมพระชนมพรรษา รัชกาลที่ 10' },
  { date: '08-12', name: 'วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี' },
  { date: '10-23', name: 'วันปิยมหาราช' },
  { date: '12-05', name: 'วันชาติ / วันพ่อแห่งชาติ' },
  { date: '12-10', name: 'วันรัฐธรรมนูญ' },
] as const;

// ─── Repositories (read-only except within this service) ─────────────────────

const holidayTypeStore: IRepository<HolidayType> = new JsonRepository<HolidayType>('holiday_types');
const holidayDateStore: IRepository<HolidayDate> = new JsonRepository<HolidayDate>('holiday_dates');

/** Consulted only to guard deleteType — no writes performed against this store. */
const departmentStore:  IRepository<Department>  = new JsonRepository<Department>('departments');

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface CreateTypeDto {
  name: string;
}

export interface UpdateTypeDto {
  name?: string;
}

export interface CreateDateDto {
  name:     string;
  date:     string;    // MM-DD
  enabled?: boolean;   // defaults to true
}

export interface UpdateDateDto {
  name?:    string;
  date?:    string;    // MM-DD
  enabled?: boolean;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const MM_DD_RE = /^\d{2}-\d{2}$/;

function assertHrRole(actorRole: UserRole): void {
  if (!hasPermission(actorRole, 'hr')) {
    throw new AppError(403, 'Only HR and Super Admin can manage holiday policies', 'FORBIDDEN');
  }
}

function assertValidMmDd(value: string, field = 'date'): void {
  if (!MM_DD_RE.test(value)) {
    throw new AppError(400, `${field} must be in MM-DD format`, 'VALIDATION_ERROR');
  }
  const [mm, dd] = value.split('-').map(Number);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    throw new AppError(400, `${field} is not a valid MM-DD value`, 'VALIDATION_ERROR');
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const holidayService = {

  // ── Holiday Types ───────────────────────────────────────────────────────────

  listTypes(): HolidayType[] {
    return holidayTypeStore.findAll();
  },

  findTypeById(id: string): HolidayType {
    const type = holidayTypeStore.findById(id);
    if (!type) throw new AppError(404, `Holiday type '${id}' not found`, 'NOT_FOUND');
    return type;
  },

  createType(dto: CreateTypeDto, actorRole: UserRole): HolidayType {
    assertHrRole(actorRole);
    if (!dto.name?.trim()) {
      throw new AppError(400, 'name is required', 'VALIDATION_ERROR');
    }
    const duplicate = holidayTypeStore.exists(
      (t) => t.name.toLowerCase() === dto.name.trim().toLowerCase(),
    );
    if (duplicate) {
      throw new AppError(409, `Holiday type '${dto.name}' already exists`, 'DUPLICATE');
    }
    return holidayTypeStore.create({
      name: dto.name.trim(),
    } as Omit<HolidayType, 'id' | 'createdAt' | 'updatedAt'>);
  },

  updateType(id: string, dto: UpdateTypeDto, actorRole: UserRole): HolidayType {
    assertHrRole(actorRole);
    this.findTypeById(id); // throws 404 if absent
    const patch: Partial<Omit<HolidayType, 'id' | 'createdAt'>> = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) {
        throw new AppError(400, 'name cannot be empty', 'VALIDATION_ERROR');
      }
      const duplicate = holidayTypeStore.exists(
        (t) => t.id !== id && t.name.toLowerCase() === dto.name!.trim().toLowerCase(),
      );
      if (duplicate) {
        throw new AppError(409, `Holiday type '${dto.name}' already exists`, 'DUPLICATE');
      }
      patch.name = dto.name.trim();
    }
    return holidayTypeStore.updateById(id, patch) as HolidayType;
  },

  /**
   * Hard-delete a holiday type.
   * Blocked if any active department references this type.
   * Cascades: all HolidayDate records for this type are deleted first.
   */
  deleteType(id: string, actorRole: UserRole): void {
    assertHrRole(actorRole);
    this.findTypeById(id); // throws 404 if absent
    const inUse = departmentStore.exists(
      (d) => d.holidayTypeId === id && d.isActive,
    );
    if (inUse) {
      throw new AppError(
        409,
        'Cannot delete this holiday type — one or more departments are using it',
        'IN_USE',
      );
    }
    // Cascade: remove all dates belonging to this type
    const dates = holidayDateStore.findAll((hd) => hd.typeId === id);
    for (const hd of dates) {
      holidayDateStore.deleteById(hd.id);
    }
    holidayTypeStore.deleteById(id);
  },

  // ── Holiday Dates ───────────────────────────────────────────────────────────

  listDates(typeId: string): HolidayDate[] {
    this.findTypeById(typeId); // 404 if type absent
    return holidayDateStore.findAll((hd) => hd.typeId === typeId);
  },

  createDate(typeId: string, dto: CreateDateDto, actorRole: UserRole): HolidayDate {
    assertHrRole(actorRole);
    this.findTypeById(typeId);
    if (!dto.name?.trim()) {
      throw new AppError(400, 'name is required', 'VALIDATION_ERROR');
    }
    assertValidMmDd(dto.date);
    const duplicate = holidayDateStore.exists(
      (hd) => hd.typeId === typeId && hd.date === dto.date,
    );
    if (duplicate) {
      throw new AppError(
        409,
        `A holiday on ${dto.date} already exists in this type`,
        'DUPLICATE',
      );
    }
    return holidayDateStore.create({
      typeId,
      name:    dto.name.trim(),
      date:    dto.date,
      enabled: dto.enabled ?? true,
    } as Omit<HolidayDate, 'id' | 'createdAt' | 'updatedAt'>);
  },

  updateDate(id: string, dto: UpdateDateDto, actorRole: UserRole): HolidayDate {
    assertHrRole(actorRole);
    const existing = holidayDateStore.findById(id);
    if (!existing) throw new AppError(404, `Holiday date '${id}' not found`, 'NOT_FOUND');
    const patch: Partial<Omit<HolidayDate, 'id' | 'createdAt'>> = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) {
        throw new AppError(400, 'name cannot be empty', 'VALIDATION_ERROR');
      }
      patch.name = dto.name.trim();
    }
    if (dto.date !== undefined) {
      assertValidMmDd(dto.date);
      const duplicate = holidayDateStore.exists(
        (hd) => hd.id !== id && hd.typeId === existing.typeId && hd.date === dto.date,
      );
      if (duplicate) {
        throw new AppError(
          409,
          `A holiday on ${dto.date} already exists in this type`,
          'DUPLICATE',
        );
      }
      patch.date = dto.date;
    }
    if (dto.enabled !== undefined) {
      patch.enabled = dto.enabled;
    }
    return holidayDateStore.updateById(id, patch) as HolidayDate;
  },

  deleteDate(id: string, actorRole: UserRole): void {
    assertHrRole(actorRole);
    const existing = holidayDateStore.findById(id);
    if (!existing) throw new AppError(404, `Holiday date '${id}' not found`, 'NOT_FOUND');
    holidayDateStore.deleteById(id);
  },

  // ── Presets ─────────────────────────────────────────────────────────────────

  /**
   * Bulk-insert THAI_PUBLIC_HOLIDAY_PRESETS into a holiday type.
   * Dates already present (matched by MM-DD) are skipped — no duplicates.
   * Returns only the newly inserted records.
   */
  loadPresets(typeId: string, actorRole: UserRole): HolidayDate[] {
    assertHrRole(actorRole);
    this.findTypeById(typeId);
    const existingDates = new Set(
      holidayDateStore.findAll((hd) => hd.typeId === typeId).map((hd) => hd.date),
    );
    const inserted: HolidayDate[] = [];
    for (const preset of THAI_PUBLIC_HOLIDAY_PRESETS) {
      if (!existingDates.has(preset.date)) {
        const record = holidayDateStore.create({
          typeId,
          name:    preset.name,
          date:    preset.date,
          enabled: true,
        } as Omit<HolidayDate, 'id' | 'createdAt' | 'updatedAt'>);
        inserted.push(record);
      }
    }
    return inserted;
  },
};
