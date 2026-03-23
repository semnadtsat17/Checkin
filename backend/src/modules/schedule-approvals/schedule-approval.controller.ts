import { Request, Response, NextFunction } from 'express';
import { ok, created } from '../../shared/utils/response';
import { scheduleApprovalService } from './schedule-approval.service';
import type { ScheduleApprovalStatus } from '@hospital-hr/shared';

// POST /api/schedule-approvals — manager submits a dept-month for approval
export async function submit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = req.user!;
    const approval = scheduleApprovalService.submit(req.body, userId, role);
    created(res, approval, 'Schedule submitted');
  } catch (err) { next(err); }
}

// GET /api/schedule-approvals
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = req.user!;
    const results = scheduleApprovalService.findAll(
      {
        departmentId: req.query.departmentId as string | undefined,
        status:       req.query.status       as ScheduleApprovalStatus | undefined,
        month:        req.query.month        as string | undefined,
      },
      userId,
      role,
    );
    ok(res, results);
  } catch (err) { next(err); }
}

// GET /api/schedule-approvals/pending-count  (HR badge)
export async function pendingCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, { count: scheduleApprovalService.pendingCount() });
  } catch (err) { next(err); }
}

// GET /api/schedule-approvals/:id
export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, scheduleApprovalService.findById(req.params.id));
  } catch (err) { next(err); }
}

// GET /api/schedule-approvals/:id/preview — draft schedule data for HR review
export async function preview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const approval = scheduleApprovalService.findById(req.params.id);
    const weeks = scheduleApprovalService.getDraftPreview(approval.departmentId, approval.month);
    ok(res, weeks);
  } catch (err) { next(err); }
}

// POST /api/schedule-approvals/:id/approve
export async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = req.user!;
    ok(res, scheduleApprovalService.approve(req.params.id, userId, role));
  } catch (err) { next(err); }
}

// POST /api/schedule-approvals/:id/reject
export async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, role } = req.user!;
    ok(res, scheduleApprovalService.reject(req.params.id, req.body, userId, role));
  } catch (err) { next(err); }
}
