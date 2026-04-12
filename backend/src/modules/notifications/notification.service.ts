import type { AppNotification, AppNotificationType } from '@hospital-hr/shared';
import { JsonRepository } from '../../shared/repository/JsonRepository';
import { emitNotification } from '../realtime/realtime.service';

const store = new JsonRepository<AppNotification>('notifications');

/** Exposed for tests only — wipes all notification records. */
export function _clearNotificationsForTests(): void {
  store.clear();
}

export const notificationService = {

  /** Create a notification for a specific user. */
  create(
    userId: string,
    type: AppNotificationType,
    title: string,
    body: string,
    relatedId?: string,
  ): AppNotification {
    const created = store.create({
      userId,
      type,
      title,
      body,
      relatedId,
      isRead: false,
    } as Omit<AppNotification, 'id' | 'createdAt' | 'updatedAt'>);
    emitNotification(created);
    return created;
  },

  /** List all notifications for a user, newest first. */
  listForUser(userId: string): AppNotification[] {
    return store
      .findAll((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Count of unread notifications for a user. */
  unreadCount(userId: string): number {
    return store.count((n) => n.userId === userId && !n.isRead);
  },

  /** Mark a notification as read. */
  markRead(id: string, userId: string): AppNotification | null {
    const n = store.findById(id);
    if (!n || n.userId !== userId) return null;
    return store.updateById(id, { isRead: true }) as AppNotification;
  },

  /** Mark all notifications for a user as read. */
  markAllRead(userId: string): void {
    const unread = store.findAll((n) => n.userId === userId && !n.isRead);
    for (const n of unread) {
      store.updateById(n.id, { isRead: true });
    }
  },
};
