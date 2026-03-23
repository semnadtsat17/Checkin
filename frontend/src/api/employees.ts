import type { User, UserRole, DepartmentAssignment, PaginatedResponse } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface CreateEmployeeDto {
  firstNameTh:              string;
  lastNameTh:               string;
  firstName?:               string;
  lastName?:                string;
  email:                    string;
  phone?:                   string;
  role:                     UserRole;
  workSchedulePatternId?:   string;
  departmentId:             string;
  branchId:                 string;
  startDate?:               string;
  monthlyHoursOverride?:    number;
}

export interface UpdateEmployeeDto extends Partial<Omit<CreateEmployeeDto, 'role'>> {
  isActive?: boolean;
}

export interface AssignRoleDto {
  role:                    UserRole;
  workSchedulePatternId?:  string | null;
}

export interface EmployeeFilters {
  departmentId?: string;
  branchId?:     string;
  role?:         UserRole;
  isActive?:     boolean;
  search?:       string;
  page?:         number;
  pageSize?:     number;
}

export const employeeApi = {
  list(f: EmployeeFilters = {}) {
    const p = new URLSearchParams();
    if (f.departmentId)            p.set('departmentId', f.departmentId);
    if (f.branchId)                p.set('branchId',     f.branchId);
    if (f.role)                    p.set('role',         f.role);
    if (f.isActive !== undefined)  p.set('isActive',     String(f.isActive));
    if (f.search)                  p.set('search',       f.search);
    if (f.page)                    p.set('page',         String(f.page));
    if (f.pageSize)                p.set('pageSize',     String(f.pageSize));
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<PaginatedResponse<User>>(`/api/employees${qs}`);
  },

  getById(id: string) {
    return apiFetch<User>(`/api/employees/${id}`);
  },

  create(dto: CreateEmployeeDto) {
    return apiFetch<{ employee: User; temporaryPassword: string }>('/api/employees', { method: 'POST', body: JSON.stringify(dto) });
  },

  resetPassword(id: string) {
    return apiFetch<{ temporaryPassword: string }>(`/api/employees/${id}/reset-password`, { method: 'POST' });
  },

  update(id: string, dto: UpdateEmployeeDto) {
    return apiFetch<User>(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
  },

  assignRole(id: string, dto: AssignRoleDto) {
    return apiFetch<User>(`/api/employees/${id}/role`, { method: 'PATCH', body: JSON.stringify(dto) });
  },

  updateManagerDepartments(id: string, departmentIds: string[]) {
    return apiFetch<User>(`/api/employees/${id}/manager-departments`, {
      method: 'PATCH',
      body: JSON.stringify({ departmentIds }),
    });
  },

  remove(id: string) {
    return apiFetch<void>(`/api/employees/${id}`, { method: 'DELETE' });
  },

  /**
   * Transfer an employee to a new department and migrate their schedules.
   * `effectiveDate` (YYYY-MM-DD) controls which schedule records are cleared.
   * Records before effectiveDate are never modified.
   */
  transferDepartment(
    id:              string,
    dto: { newDepartmentId: string; effectiveDate: string },
  ) {
    return apiFetch<{ employee: User; assignment: DepartmentAssignment }>(
      `/api/employees/${id}/transfer-department`,
      { method: 'POST', body: JSON.stringify(dto) },
    );
  },
};
