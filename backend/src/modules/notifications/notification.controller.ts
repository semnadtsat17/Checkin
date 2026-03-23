import { Request, Response, NextFunction } from 'express';
import { ok } from '../../shared/utils/response';
import { notificationService } from './notification.service';

// GET /api/notifications
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, notificationService.listForUser(req.user!.userId));
  } catch (err) { next(err); }
}

// GET /api/notifications/unread-count
export async function unreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { count: notificationService.unreadCount(req.user!.userId) });
  } catch (err) { next(err); }
}

// PATCH /api/notifications/:id/read
export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const n = notificationService.markRead(req.params.id, req.user!.userId);
    ok(res, n);
  } catch (err) { next(err); }
}

// PATCH /api/notifications/read-all
export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    notificationService.markAllRead(req.user!.userId);
    ok(res, null, 'All notifications marked as read');
  } catch (err) { next(err); }
}
