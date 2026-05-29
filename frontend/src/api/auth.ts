import type { UserProfile } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface BranchSlim {
  id:       string;
  nameTh:   string;
  nameEn:   string;
  province: string | undefined;
}

export interface LoginResponse {
  token:              string;
  profile:            UserProfile;
  branches:           BranchSlim[];
  mustChangePassword: boolean;
}

export interface SelectBranchResponse {
  token:   string;
  profile: UserProfile;
}

export const authApi = {
  login(email: string, password: string) {
    return apiFetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  selectBranch(branchId: string) {
    return apiFetch<SelectBranchResponse>('/api/auth/select-branch', {
      method: 'POST',
      body: JSON.stringify({ branchId }),
    });
  },

  listBranches() {
    return apiFetch<BranchSlim[]>('/api/auth/branches');
  },

  me() {
    return apiFetch<UserProfile>('/api/auth/me');
  },

  changePassword(currentPassword: string, newPassword: string) {
    return apiFetch<null>('/api/auth/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  setPassword(userId: string, password: string) {
    return apiFetch<null>(`/api/auth/password/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    });
  },
};
