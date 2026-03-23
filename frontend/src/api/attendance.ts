import type { AttendanceRecord } from '@hospital-hr/shared';
import { apiFetch, apiFetchMultipart } from './client';

const BASE = '/api/attendance';

// ── Check-in / Check-out ──────────────────────────────────────────────────────

export interface CheckPayload {
  lat?:   number;
  lng?:   number;
  photo?: File;
  note?:  string;
}

function buildFormData(payload: CheckPayload): FormData {
  const fd = new FormData();
  if (payload.photo)              fd.append('photo', payload.photo);
  if (payload.lat  !== undefined) fd.append('lat',  String(payload.lat));
  if (payload.lng  !== undefined) fd.append('lng',  String(payload.lng));
  if (payload.note)               fd.append('note', payload.note);
  return fd;
}

export function checkIn(payload: CheckPayload): Promise<AttendanceRecord> {
  return apiFetchMultipart<AttendanceRecord>(`${BASE}/check-in`, {
    method: 'POST',
    body: buildFormData(payload),
  });
}

export function checkOut(payload: CheckPayload): Promise<AttendanceRecord> {
  return apiFetchMultipart<AttendanceRecord>(`${BASE}/check-out`, {
    method: 'POST',
    body: buildFormData(payload),
  });
}

// ── Query ─────────────────────────────────────────────────────────────────────

export function getToday(): Promise<AttendanceRecord | null> {
  return apiFetch<AttendanceRecord | null>(`${BASE}/today`);
}

export function getMyRecords(from?: string, to?: string): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to)   params.set('to',   to);
  const qs = params.toString() ? `?${params}` : '';
  return apiFetch<AttendanceRecord[]>(`${BASE}/me${qs}`);
}

// ── Monthly summary ───────────────────────────────────────────────────────────

export interface MonthlySummary {
  month:          string;
  userId:         string;
  workedMinutes:  number;
  workedHours:    number;
  monthlyTarget:  number;
  overtime:       number;
  presentDays:    number;
  lateDays:       number;
  earlyLeaveDays: number;
  absentDays:     number;
  pendingDays:    number;
  leaveDays:      number;
}

export function getMySummary(month: string): Promise<MonthlySummary> {
  return apiFetch<MonthlySummary>(`${BASE}/summary/me?month=${month}`);
}

// ── Admin (manager/HR) ────────────────────────────────────────────────────────

export interface AttendanceFilters {
  status?:   string;
  deptId?:   string;
  userId?:   string;
  from?:     string;
  to?:       string;
}

export function listAttendance(filters: AttendanceFilters = {}): Promise<AttendanceRecord[]> {
  const p = new URLSearchParams();
  if (filters.status) p.set('status', filters.status);
  if (filters.deptId) p.set('deptId', filters.deptId);
  if (filters.userId) p.set('userId', filters.userId);
  if (filters.from)   p.set('from',   filters.from);
  if (filters.to)     p.set('to',     filters.to);
  const qs = p.toString() ? `?${p}` : '';
  return apiFetch<AttendanceRecord[]>(`${BASE}${qs}`);
}

export function getAttendance(id: string): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>(`${BASE}/${id}`);
}

export function approveAttendance(id: string): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>(`${BASE}/${id}/approve`, { method: 'PATCH' });
}

export function rejectAttendance(id: string): Promise<AttendanceRecord> {
  return apiFetch<AttendanceRecord>(`${BASE}/${id}/reject`, { method: 'PATCH' });
}

/** Convert a stored photo filename to a URL proxied through Vite dev server. */
export function photoSrc(filename?: string | null): string | null {
  if (!filename) return null;
  return `/photos/${filename}`;
}
