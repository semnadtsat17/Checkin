import type { AppNotification } from '@hospital-hr/shared';
import { apiFetch } from './client';

export const notificationsApi = {

  list(): Promise<AppNotification[]> {
    return apiFetch('/api/notifications');
  },

  unreadCount(): Promise<{ count: number }> {
    return apiFetch('/api/notifications/unread-count');
  },

  markRead(id: string): Promise<AppNotification> {
    return apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
  },

  markAllRead(): Promise<void> {
    return apiFetch('/api/notifications/read-all', { method: 'PATCH' });
  },
};
