import { Request, Response, NextFunction } from 'express';
import { attendanceService } from './attendance.service';
import { ok, created } from '../../shared/utils/response';
import type { AttendanceStatus } from '@hospital-hr/shared';

// POST /attendance/check-in   (multipart/form-data: photo + lat + lng + note)
export function checkIn(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, branchId } = req.user!;
    const lat  = req.body.lat  !== undefined ? parseFloat(req.body.lat)  : undefined;
    const lng  = req.body.lng  !== undefined ? parseFloat(req.body.lng)  : undefined;

    const record = attendanceService.checkIn(userId, branchId, {
      lat,
      lng,
      photoPath: req.file?.filename,
      note:      req.body.note,
    });
    created(res, record, 'Check-in successful');
  } catch (e) { next(e); }
}

// POST /attendance/check-out  (multipart/form-data: photo + lat + lng + note)
export function checkOut(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, branchId } = req.user!;
    const lat  = req.body.lat  !== undefined ? parseFloat(req.body.lat)  : undefined;
    const lng  = req.body.lng  !== undefined ? parseFloat(req.body.lng)  : undefined;

    const record = attendanceService.checkOut(userId, branchId, {
      lat,
      lng,
      photoPath: req.file?.filename,
      note:      req.body.note,
    });
    ok(res, record, 'Check-out successful');
  } catch (e) { next(e); }
}

// GET /attendance/today  — current user's record for today
export function getToday(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, attendanceService.getToday(req.user!.userId));
  } catch (e) { next(e); }
}

// GET /attendance/me?from=YYYY-MM-DD&to=YYYY-MM-DD
export function getMyRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to } = req.query as Record<string, string>;
    ok(res, attendanceService.getMyRecords(req.user!.userId, from, to));
  } catch (e) { next(e); }
}

// GET /attendance?userId=&deptId=&branchId=&from=&to=&status=
export function list(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query as Record<string, string>;
    const records = attendanceService.list(
      {
        userId:   q.userId,
        deptId:   q.deptId,
        branchId: q.branchId,
        from:     q.from,
        to:       q.to,
        status:   q.status as AttendanceStatus | undefined,
      },
      req.user!.userId,
      req.user!.role,
    );
    ok(res, records);
  } catch (e) { next(e); }
}

// GET /attendance/:id
export function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, attendanceService.findById(req.params.id));
  } catch (e) { next(e); }
}

// PATCH /attendance/:id/approve
export function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = req.user!;
    ok(res, attendanceService.approve(req.params.id, userId, role), 'Attendance approved');
  } catch (e) { next(e); }
}

// PATCH /attendance/:id/reject
export function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = req.user!;
    ok(res, attendanceService.reject(req.params.id, userId, role), 'Attendance rejected');
  } catch (e) { next(e); }
}

// GET /attendance/summary/me?month=YYYY-MM
export function getMySummary(req: Request, res: Response, next: NextFunction) {
  try {
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);
    ok(res, attendanceService.getMySummary(req.user!.userId, month));
  } catch (e) { next(e); }
}

// GET /attendance/summary/:userId?month=YYYY-MM
export function getSummaryForUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId, role } = req.user!;
    const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);
    ok(res, attendanceService.getSummary(req.params.userId, month, userId, role));
  } catch (e) { next(e); }
}
