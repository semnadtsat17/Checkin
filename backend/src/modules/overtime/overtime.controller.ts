import type { Request, Response, NextFunction } from 'express';
import { ok, created, noContent } from '../../shared/utils/response';
import { overtimeService } from './overtime.service';
import type { OvertimeFilters } from './overtime.service';
import type { OvertimeStatus } from '@hospital-hr/shared';

// GET /api/overtime?userId=&departmentId=&branchId=&status=&from=&to=
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters: OvertimeFilters = {
      userId:       req.query.userId       as string | undefined,
      departmentId: req.query.departmentId as string | undefined,
      status:       req.query.status       as OvertimeStatus | undefined,
      from:         req.query.from         as string | undefined,
      to:           req.query.to           as string | undefined,
      branchId:     (req.query.branchId    as string | undefined) ?? req.user?.branchId,
    };
    ok(res, overtimeService.list(filters));
  } catch (err) { next(err); }
}

// GET /api/overtime/my
export async function listMy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters: Omit<OvertimeFilters, 'userId'> = {
      status: req.query.status as OvertimeStatus | undefined,
      from:   req.query.from   as string | undefined,
      to:     req.query.to     as string | undefined,
    };
    ok(res, overtimeService.my(req.user!.userId, filters));
  } catch (err) { next(err); }
}

// GET /api/overtime/:id
export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, overtimeService.findById(req.params.id));
  } catch (err) { next(err); }
}

// POST /api/overtime
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = overtimeService.create(req.body, req.user!.userId, req.user!.branchId);
    created(res, record);
  } catch (err) { next(err); }
}

// PATCH /api/overtime/:id/status
export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = overtimeService.updateStatus(
      req.params.id,
      req.body,
      req.user!.userId,
      req.user!.role,
    );
    ok(res, record);
  } catch (err) { next(err); }
}

// DELETE /api/overtime/:id
export async function cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    overtimeService.cancel(req.params.id, req.user!.userId);
    noContent(res);
  } catch (err) { next(err); }
}
