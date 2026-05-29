import type { Branch } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface CreateBranchDto {
  nameTh:        string;
  nameEn:        string;
  province?:     string;
  address?:      string;
}

export interface UpdateBranchDto {
  nameTh?:       string;
  nameEn?:       string;
  province?:     string;
  address?:      string;
  isActive?:     boolean;
}

export interface SetGpsDto {
  latitude:      number;
  longitude:     number;
  radiusMeters:  number;
}

export const branchApi = {
  list() {
    return apiFetch<Branch[]>('/api/branches');
  },

  getOne(id: string) {
    return apiFetch<Branch>(`/api/branches/${id}`);
  },

  create(dto: CreateBranchDto) {
    return apiFetch<Branch>('/api/branches', {
      method: 'POST',
      body:   JSON.stringify(dto),
    });
  },

  update(id: string, dto: UpdateBranchDto) {
    return apiFetch<Branch>(`/api/branches/${id}`, {
      method: 'PATCH',
      body:   JSON.stringify(dto),
    });
  },

  setGps(id: string, dto: SetGpsDto) {
    return apiFetch<Branch>(`/api/branches/${id}/gps`, {
      method: 'PATCH',
      body:   JSON.stringify(dto),
    });
  },

  clearGps(id: string) {
    return apiFetch<Branch>(`/api/branches/${id}/gps`, {
      method: 'DELETE',
    });
  },

  remove(id: string) {
    return apiFetch<void>(`/api/branches/${id}`, {
      method: 'DELETE',
    });
  },
};
