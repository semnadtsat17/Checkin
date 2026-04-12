/**
 * leave.controller.ts
 *
 * Thin HTTP adapters — parse request, call service, return response.
 * No business logic here; all decisions live in leave.service.ts.
 */
import type { Request, Response, NextFunction } from 'express';
import { leaveService } from './leave.service';
import { ok, created } from '../../shared/utils/response';
import type { CreateLeaveRequestDto, RejectLeaveDto } from './leave.types';

// POST /leave
// Body: CreateLeaveRequestDto + optional targetUserId (managers creating on behalf)
export function create(req: Request, res: Response, next: NextFunction): void {
  try {
    const { userId: actorUserId, role: actorRole } = req.user!;
    // Default target is the actor themselves; managers may pass targetUserId
    const targetUserId = (req.body.targetUserId as string | undefined) ?? actorUserId;

    const dto: CreateLeaveRequestDto = {
      leaveType:    req.body.leaveType,
      startDate:    req.body.startDate,
      endDate:      req.body.endDate,
      durationType: req.body.durationType,
      reason:       req.body.reason,
    };

    const leave = leaveService.createLeaveRequest(dto, targetUserId, actorUserId, actorRole);
    created(res, leave, 'Leave request submitted');
  } catch (e) { next(e); }
}

// GET /leave?userId=&status=&leaveType=&from=&to=
export function list(req: Request, res: Response, next: NextFunction): void {
  try {
    const { userId: actorUserId, role: actorRole } = req.user!;
    const q = req.query as Record<string, string>;

    // Managers and HR pass userId to view a specific employee; employees always see own
    const targetUserId = q.userId ?? actorUserId;

    const leaves = leaveService.getUserLeaves(targetUserId, actorUserId, actorRole, {
      status:    q.status    as any,
      leaveType: q.leaveType as any,
      from:      q.from,
      to:        q.to,
    });
    ok(res, leaves);
  } catch (e) { next(e); }
}

// GET /leave/range?from=&to=&userId=&status=&leaveType=
export function listByDateRange(req: Request, res: Response, next: NextFunction): void {
  try {
    const { userId: actorUserId, role: actorRole } = req.user!;
    const q = req.query as Record<string, string>;

    const leaves = leaveService.getLeavesByDateRange(
      q.from, q.to,
      actorUserId, actorRole,
      { userId: q.userId, status: q.status as any, leaveType: q.leaveType as any },
    );
    ok(res, leaves);
  } catch (e) { next(e); }
}

// GET /leave/:id
export function getOne(req: Request, res: Response, next: NextFunction): void {
  try {
    ok(res, leaveService.findById(req.params.id));
  } catch (e) { next(e); }
}

// PATCH /leave/:id/approve-manager
export function approveByManager(req: Request, res: Response, next: NextFunction): void {
  try {
    const { userId, role } = req.user!;
    ok(res, leaveService.approveByManager(req.params.id, userId, role), 'Approved by manager');
  } catch (e) { next(e); }
}

// PATCH /leave/:id/approve-hr
export function approveByHR(req: Request, res: Response, next: NextFunction): void {
  try {
    const { userId, role } = req.user!;
    ok(res, leaveService.approveByHR(req.params.id, userId, role), 'Approved by HR');
  } catch (e) { next(e); }
}

// PATCH /leave/:id/reject
export function reject(req: Request, res: Response, next: NextFunction): void {
  try {
    const { userId, role } = req.user!;
    const dto: RejectLeaveDto = { reason: req.body.reason };
    ok(res, leaveService.rejectLeave(req.params.id, userId, role, dto), 'Leave request rejected');
  } catch (e) { next(e); }
}
