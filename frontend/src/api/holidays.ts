import type { HolidayType, HolidayDate } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface CreateTypeDto {
  name: string;
}

export interface UpdateTypeDto {
  name?: string;
}

export interface CreateDateDto {
  name:    string;
  date:    string;    // MM-DD
  enabled: boolean;
}

export interface UpdateDateDto {
  name?:    string;
  date?:    string;
  enabled?: boolean;
}

export const holidaysApi = {
  // ── Holiday Types ────────────────────────────────────────────────────────────

  listTypes() {
    return apiFetch<HolidayType[]>('/api/holidays/types');
  },

  createType(dto: CreateTypeDto) {
    return apiFetch<HolidayType>('/api/holidays/types', {
      method: 'POST',
      body:   JSON.stringify(dto),
    });
  },

  updateType(id: string, dto: UpdateTypeDto) {
    return apiFetch<HolidayType>(`/api/holidays/types/${id}`, {
      method: 'PATCH',
      body:   JSON.stringify(dto),
    });
  },

  deleteType(id: string) {
    return apiFetch<null>(`/api/holidays/types/${id}`, { method: 'DELETE' });
  },

  // ── Holiday Dates ────────────────────────────────────────────────────────────

  listDates(typeId: string) {
    return apiFetch<HolidayDate[]>(`/api/holidays/types/${typeId}/dates`);
  },

  createDate(typeId: string, dto: CreateDateDto) {
    return apiFetch<HolidayDate>(`/api/holidays/types/${typeId}/dates`, {
      method: 'POST',
      body:   JSON.stringify(dto),
    });
  },

  loadPresets(typeId: string) {
    return apiFetch<{ inserted: number }>(`/api/holidays/types/${typeId}/presets`, {
      method: 'POST',
    });
  },

  updateDate(id: string, dto: UpdateDateDto) {
    return apiFetch<HolidayDate>(`/api/holidays/dates/${id}`, {
      method: 'PATCH',
      body:   JSON.stringify(dto),
    });
  },

  deleteDate(id: string) {
    return apiFetch<null>(`/api/holidays/dates/${id}`, { method: 'DELETE' });
  },
};
