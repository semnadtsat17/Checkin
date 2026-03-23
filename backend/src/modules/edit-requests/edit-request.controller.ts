import { Request, Response, NextFunction } from 'express';
import { editRequestService } from './edit-request.service';
import { ok, created } from '../../shared/utils/response';
import type { EditRequestStatus } from '@hospital-hr/shared';

// POST /edit-requests
export function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = req.user!;
    created(res, editRequestService.create(req.body, userId, role));
  } catch (e) { next(e); }
}

// GET /edit-requests?status=&attendanceId=&from=&to=
export function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = req.user!;
    const q = req.query as Record<string, string>;
    ok(res, editRequestService.list(userId, role, {
      attendanceId: q.attendanceId,
      status:       q.status as EditRequestStatus | undefined,
      from:         q.from,
      to:           q.to,
    }));
  } catch (e) { next(e); }
}

// GET /edit-requests/:id
export function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = req.user!;
    ok(res, editRequestService.findById(req.params.id, userId, role));
  } catch (e) { next(e); }
}

// PATCH /edit-requests/:id/approve
export function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = req.user!;
    ok(res, editRequestService.approve(req.params.id, userId, role), 'Edit request approved');
  } catch (e) { next(e); }
}

// PATCH /edit-requests/:id/reject
export function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = req.user!;
    const { rejectReason } = req.body as { rejectReason?: string };
    ok(res, editRequestService.reject(req.params.id, rejectReason, userId, role), 'Edit request rejected');
  } catch (e) { next(e); }
}
