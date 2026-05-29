import type { ShiftTransferRequest, ShiftTransferStatus } from '@hospital-hr/shared';
import { apiFetch } from './client';

const BASE = '/shift-transfer';

export interface CreateShiftTransferDto {
  receiverId: string;
  shiftDate:  string;
  shiftCode:  string;
}

export const shiftTransferApi = {
  listMy(): Promise<ShiftTransferRequest[]> {
    return apiFetch<ShiftTransferRequest[]>(`${BASE}/my`);
  },

  list(params?: { status?: ShiftTransferStatus; departmentId?: string; branchId?: string }): Promise<ShiftTransferRequest[]> {
    const p = new URLSearchParams();
    if (params?.status)       p.set('status',       params.status);
    if (params?.departmentId) p.set('departmentId', params.departmentId);
    if (params?.branchId)     p.set('branchId',     params.branchId);
    const qs = p.toString() ? `?${p}` : '';
    return apiFetch<ShiftTransferRequest[]>(`${BASE}${qs}`);
  },

  create(dto: CreateShiftTransferDto): Promise<ShiftTransferRequest> {
    return apiFetch<ShiftTransferRequest>(BASE, { method: 'POST', body: JSON.stringify(dto) });
  },

  respond(id: string, response: 'accepted' | 'declined'): Promise<ShiftTransferRequest> {
    return apiFetch<ShiftTransferRequest>(`${BASE}/${id}/respond`, {
      method: 'PATCH', body: JSON.stringify({ response }),
    });
  },

  managerDecision(id: string, decision: 'approved' | 'rejected', note?: string): Promise<ShiftTransferRequest> {
    return apiFetch<ShiftTransferRequest>(`${BASE}/${id}/manager-decision`, {
      method: 'PATCH', body: JSON.stringify({ decision, note }),
    });
  },

  cancel(id: string): Promise<unknown> {
    return apiFetch<unknown>(`${BASE}/${id}`, { method: 'DELETE' });
  },
};
