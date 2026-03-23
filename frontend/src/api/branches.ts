import type { Branch } from '@hospital-hr/shared';
import { apiFetch } from './client';

export const branchApi = {
  list() {
    return apiFetch<Branch[]>('/api/branches');
  },
};
