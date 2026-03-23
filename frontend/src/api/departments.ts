import type { Department, PaginatedResponse } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface CreateDeptDto {
  nameTh:                  string;
  nameEn?:                 string;
  branchId:                string;
  managerId?:              string;
  workSchedulePatternId?:  string;
  holidayTypeId?:          string | null;
  requireHrApproval?:      boolean;
}

export interface UpdateDeptDto extends Partial<CreateDeptDto> {
  isActive?:            boolean;
  requireHrApproval?:   boolean;
}

export interface DeptFilters {
  branchId?:  string;
  isActive?:  boolean;
  search?:    string;
  page?:      number;
  pageSize?:  number;
}

export const deptApi = {
  list(f: DeptFilters = {}) {
    const p = new URLSearchParams();
    if (f.branchId)               p.set('branchId',  f.branchId);
    if (f.isActive !== undefined)  p.set('isActive',  String(f.isActive));
    if (f.search)                  p.set('search',    f.search);
    if (f.page)                    p.set('page',      String(f.page));
    if (f.pageSize)                p.set('pageSize',  String(f.pageSize));
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<PaginatedResponse<Department>>(`/api/departments${qs}`);
  },

  create(dto: CreateDeptDto) {
    return apiFetch<Department>('/api/departments', { method: 'POST', body: JSON.stringify(dto) });
  },

  update(id: string, dto: UpdateDeptDto) {
    return apiFetch<Department>(`/api/departments/${id}`, { method: 'PUT', body: JSON.stringify(dto) });
  },

  remove(id: string) {
    return apiFetch<Department>(`/api/departments/${id}`, { method: 'DELETE' });
  },
};
