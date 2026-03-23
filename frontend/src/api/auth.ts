import type { User } from '@hospital-hr/shared';
import { apiFetch } from './client';

export interface LoginResponse {
  token:              string;
  profile:            User;
  mustChangePassword: boolean;
}

export const authApi = {
  login(email: string, password: string) {
    return apiFetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return apiFetch<User>('/api/auth/me');
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
