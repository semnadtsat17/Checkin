import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@hospital-hr/shared';
import { ok, created, noContent } from '../../shared/utils/response';
import { workSchedulePatternService } from './sub-role.service';

// GET /api/work-schedule-patterns?forRole=&isActive=
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patterns = workSchedulePatternService.findAll({
      forRole:  req.query.forRole  as UserRole | undefined,
      isActive: req.query.isActive === 'true'  ? true  :
                req.query.isActive === 'false' ? false : undefined,
    });
    ok(res, patterns);
  } catch (err) {
    next(err);
  }
}

// GET /api/work-schedule-patterns/:id
export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, workSchedulePatternService.findById(req.params.id));
  } catch (err) {
    next(err);
  }
}

// POST /api/work-schedule-patterns
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    created(res, workSchedulePatternService.create(req.body), 'WorkSchedulePattern created');
  } catch (err) {
    next(err);
  }
}

// PUT /api/work-schedule-patterns/:id
export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    ok(res, workSchedulePatternService.update(req.params.id, req.body), 'WorkSchedulePattern updated');
  } catch (err) {
    next(err);
  }
}

// DELETE /api/work-schedule-patterns/:id
export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    workSchedulePatternService.remove(req.params.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
}
