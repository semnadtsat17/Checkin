import type { Request, Response, NextFunction } from 'express';
import { shiftTransferService } from './shift-transfer.service';
import { ok, created } from '../../shared/utils/response';
import type { ShiftTransferStatus } from '@hospital-hr/shared';

// POST /shift-transfer
export function create(req: Request, res: Response, next: NextFunction): void {
  try {
    const { userId } = req.user!;
    const result = shiftTransferService.create(
      { receiverId: req.body.receiverId, shiftDate: req.body.shiftDate, shiftCode: req.body.shiftCode },
      userId,
    );
    created(res, result, 'Shift transfer request created');
  } catch (e) { next(e); }
}

// GET /shift-transfer/my
export function listMy(req: Request, res: Response, next: NextFunction): void {
  try {
    ok(res, shiftTransferService.my(req.user!.userId));
  } catch (e) { next(e); }
}

// GET /shift-transfer
export function list(req: Request, res: Response, next: NextFunction): void {
  try {
    const q = req.query as Record<string, string>;
    ok(res, shiftTransferService.list({
      status:       q.status       as ShiftTransferStatus | undefined,
      departmentId: q.departmentId,
      branchId:     q.branchId,
    }));
  } catch (e) { next(e); }
}

// GET /shift-transfer/:id
export function getOne(req: Request, res: Response, next: NextFunction): void {
  try {
    ok(res, shiftTransferService.findById(req.params.id));
  } catch (e) { next(e); }
}

// PATCH /shift-transfer/:id/respond
export function respond(req: Request, res: Response, next: NextFunction): void {
  try {
    const result = shiftTransferService.respond(
      req.params.id,
      req.user!.userId,
      req.body.response,
    );
    ok(res, result);
  } catch (e) { next(e); }
}

// PATCH /shift-transfer/:id/manager-decision
export function managerDecision(req: Request, res: Response, next: NextFunction): void {
  try {
    const { userId, role } = req.user!;
    const result = shiftTransferService.managerDecision(
      req.params.id,
      userId,
      role,
      req.body.decision,
      req.body.note,
    );
    ok(res, result);
  } catch (e) { next(e); }
}

// DELETE /shift-transfer/:id
export function cancel(req: Request, res: Response, next: NextFunction): void {
  try {
    shiftTransferService.cancel(req.params.id, req.user!.userId);
    ok(res, { cancelled: true });
  } catch (e) { next(e); }
}
