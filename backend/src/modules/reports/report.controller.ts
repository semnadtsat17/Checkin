import { Request, Response, NextFunction } from 'express';
import { reportService } from './report.service';
import { ok } from '../../shared/utils/response';

// GET /reports/weekly?weekStart=YYYY-MM-DD&deptId=
export function weekly(req: Request, res: Response, next: NextFunction) {
  try {
    const { weekStart, deptId } = req.query as Record<string, string>;
    const { userId, role } = req.user!;
    ok(res, reportService.weekly(weekStart, deptId, userId, role));
  } catch (e) { next(e); }
}

// GET /reports/monthly?month=YYYY-MM&deptId=
export function monthly(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, deptId } = req.query as Record<string, string>;
    const { userId, role } = req.user!;
    ok(res, reportService.monthly(month, deptId, userId, role));
  } catch (e) { next(e); }
}

// GET /reports/planned-vs-actual?month=YYYY-MM&deptId=
export function plannedVsActual(req: Request, res: Response, next: NextFunction) {
  try {
    const { month, deptId } = req.query as Record<string, string>;
    const { userId, role } = req.user!;
    ok(res, reportService.plannedVsActual(month, deptId, userId, role));
  } catch (e) { next(e); }
}

// GET /reports/pending-approvals?deptId=
export function pendingApprovals(req: Request, res: Response, next: NextFunction) {
  try {
    const { deptId } = req.query as Record<string, string>;
    const { userId, role } = req.user!;
    ok(res, reportService.pendingApprovals(deptId, userId, role));
  } catch (e) { next(e); }
}
