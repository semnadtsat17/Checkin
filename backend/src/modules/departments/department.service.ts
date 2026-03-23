import type { Department } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import type { IRepository } from '../../shared/repository/IRepository';
import { AppError } from '../../shared/middleware/errorHandler';
import type { UserRecord } from '../employees/employee.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateDepartmentDto {
  nameTh: string;
  nameEn?: string;
  branchId: string;
  managerId?: string;
  workSchedulePatternId?: string;
  requireHrApproval?: boolean;
  holidayTypeId?: string | null;
}

export interface UpdateDepartmentDto {
  nameTh?: string;
  nameEn?: string;
  branchId?: string;
  managerId?: string | null;
  workSchedulePatternId?: string | null;
  requireHrApproval?: boolean;
  isActive?: boolean;
  holidayTypeId?: string | null;
}

export interface DepartmentFilters {
  branchId?: string;
  isActive?: boolean;    // default: show all
  search?: string;       // matches nameTh or nameEn (case-insensitive)
  page?: number;
  pageSize?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const store:         IRepository<Department> = new JsonRepository<Department>('departments');
const employeeStore: IRepository<UserRecord>  = new JsonRepository<UserRecord>('employees');

export const departmentService = {

  /**
   * List departments with optional filtering and pagination.
   * Called by the controller which has already applied branch restriction.
   */
  findAll(filters: DepartmentFilters = {}) {
    const { branchId, isActive, search, page = 1, pageSize = 20 } = filters;

    return store.paginate({
      page,
      pageSize,
      filter: (d) => {
        if (branchId && d.branchId !== branchId) return false;
        if (isActive !== undefined && d.isActive !== isActive) return false;
        if (search) {
          const q = search.toLowerCase();
          const matchTh = d.nameTh.toLowerCase().includes(q);
          const matchEn = (d.nameEn ?? '').toLowerCase().includes(q);
          if (!matchTh && !matchEn) return false;
        }
        return true;
      },
      sort: { field: 'nameTh', order: 'asc' },
    });
  },

  /** Get a single department or throw 404. */
  findById(id: string): Department {
    const dept = store.findById(id);
    if (!dept) throw new AppError(404, `Department '${id}' not found`, 'NOT_FOUND');
    return dept;
  },

  /** Create a new department. Validates required fields and uniqueness. */
  create(dto: CreateDepartmentDto): Department {
    if (!dto.nameTh?.trim()) {
      throw new AppError(400, 'nameTh is required', 'VALIDATION_ERROR');
    }
    if (!dto.branchId?.trim()) {
      throw new AppError(400, 'branchId is required', 'VALIDATION_ERROR');
    }

    // Uniqueness: nameTh must be unique within a branch
    const duplicate = store.exists(
      (d) =>
        d.branchId === dto.branchId &&
        d.nameTh.toLowerCase() === dto.nameTh.trim().toLowerCase() &&
        d.isActive
    );
    if (duplicate) {
      throw new AppError(
        409,
        `Department '${dto.nameTh}' already exists in this branch`,
        'DUPLICATE'
      );
    }

    return store.create({
      nameTh: dto.nameTh.trim(),
      nameEn: dto.nameEn?.trim() ?? '',
      branchId: dto.branchId,
      managerId: dto.managerId,
      workSchedulePatternId: dto.workSchedulePatternId,
      requireHrApproval: dto.requireHrApproval ?? false,
      holidayTypeId: dto.holidayTypeId ?? undefined,
      isActive: true,
    } as Omit<Department, 'id' | 'createdAt' | 'updatedAt'>);
  },

  /** Partial update — only provided fields are changed. */
  update(id: string, dto: UpdateDepartmentDto): Department {
    const existing = this.findById(id); // throws 404 if absent

    // If renaming, check duplicate within same (or new) branch
    const targetBranchId = dto.branchId ?? existing.branchId;
    const targetNameTh   = dto.nameTh?.trim() ?? existing.nameTh;

    if (dto.nameTh || dto.branchId) {
      const duplicate = store.exists(
        (d) =>
          d.id !== id &&
          d.branchId === targetBranchId &&
          d.nameTh.toLowerCase() === targetNameTh.toLowerCase() &&
          d.isActive
      );
      if (duplicate) {
        throw new AppError(
          409,
          `Department '${targetNameTh}' already exists in this branch`,
          'DUPLICATE'
        );
      }
    }

    const patch: Partial<Omit<Department, 'id' | 'createdAt'>> = {};
    if (dto.nameTh     !== undefined) patch.nameTh     = dto.nameTh.trim();
    if (dto.nameEn     !== undefined) patch.nameEn     = dto.nameEn?.trim() ?? '';
    if (dto.branchId   !== undefined) patch.branchId   = dto.branchId;
    if (dto.isActive          !== undefined) patch.isActive          = dto.isActive;
    if (dto.requireHrApproval !== undefined) patch.requireHrApproval = dto.requireHrApproval;
    // Allow clearing workSchedulePatternId with explicit null
    if ('workSchedulePatternId' in dto) {
      patch.workSchedulePatternId = dto.workSchedulePatternId ?? undefined;
    }

    // Allow clearing managerId with explicit null
    if ('managerId' in dto) {
      patch.managerId = dto.managerId ?? undefined;
    }

    // Allow clearing holidayTypeId with explicit null
    if ('holidayTypeId' in dto) {
      patch.holidayTypeId = dto.holidayTypeId ?? undefined;
    }

    const updated = store.updateById(id, patch) as Department;

    // ── Propagate workSchedulePatternId change to all employees in this department ─────
    if ('workSchedulePatternId' in dto) {
      const newPatternId = dto.workSchedulePatternId ?? undefined;
      const affected = employeeStore.findAll((u) => u.departmentId === id);
      for (const emp of affected) {
        employeeStore.updateById(emp.id, { workSchedulePatternId: newPatternId });
      }
    }

    return updated;
  },

  /**
   * Soft-delete a department.
   * Sets isActive = false; does not remove the record.
   */
  remove(id: string): Department {
    this.findById(id); // throws 404 if absent
    return store.softDelete(id) as Department;
  },
};
