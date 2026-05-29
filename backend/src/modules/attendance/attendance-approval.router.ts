/**
 * attendance-approval.router.ts
 *
 * REST endpoints for the manager approval workflow.
 *
 * Route summary:
 *   POST   /attendance-approvals            Create approval record (internal / employee-triggered)
 *   GET    /attendance-approvals            List approvals (managers: all pending; employees: own)
 *   GET    /attendance-approvals/:id        Get single record
 *   PATCH  /attendance-approvals/:id        Approve or reject (managers only)
 *
 * Auth: all routes require a valid JWT (authenticate).
 * Role guards are applied per-route as documented below.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate }  from '../../shared/middleware/auth';
import { requireRole }   from '../../shared/middleware/requireRole';
import { ok, created, notFoundResponse } from '../../shared/utils/response';
import { AppError }      from '../../shared/middleware/errorHandler';
import {
  createLateApprovalIfNeeded,
  createOtApprovalIfNeeded,
  reviewApproval,
  listPendingApprovals,
  listApprovalsByStatus,
  listAllApprovals,
  listApprovalsForEmployee,
} from './services/attendanceApprovalService';
import { getApprovalById } from './repositories/attendanceApprovalRepo';

const router = Router();
router.use(authenticate);

// ─── POST /attendance-approvals ───────────────────────────────────────────────
//
// Internal endpoint: called by the check-in / check-out flow to persist an
// approval record whenever the processor returns lateApprovalStatus === 'PENDING'
// or otApprovalStatus === 'PENDING'.
//
// Body for LATE:
//   { type: 'LATE', employeeId, lateMinutes, lateApprovalStatus }
//
// Body for OT:
//   { type: 'OT', employeeId, otMinutes, otApprovalStatus }
//
// Both employee and manager roles are allowed — employees trigger this on
// their own check-in/out; managers may trigger it programmatically.

router.post(
  '/',
  requireRole(['employee', 'part_time', 'super_admin', 'admin', 'hr_branch', 'manager']),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type } = req.body as { type?: string };

      if (type === 'LATE') {
        const { employeeId, lateMinutes, lateApprovalStatus } = req.body as {
          employeeId:          string;
          lateMinutes:         number;
          lateApprovalStatus:  string;
        };

        if (!employeeId || lateMinutes === undefined || !lateApprovalStatus) {
          return next(new AppError(400, 'employeeId, lateMinutes, and lateApprovalStatus are required', 'VALIDATION_ERROR'));
        }

        const record = createLateApprovalIfNeeded({
          employeeId,
          isLate:             true,
          lateMinutes:        Number(lateMinutes),
          lateApprovalStatus: lateApprovalStatus as 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED',
        });

        if (!record) {
          return ok(res, null, 'No approval record required (status is not PENDING)');
        }

        return created(res, record);
      }

      if (type === 'OT') {
        const { employeeId, otMinutes, otApprovalStatus } = req.body as {
          employeeId:       string;
          otMinutes:        number;
          otApprovalStatus: string;
        };

        if (!employeeId || otMinutes === undefined || !otApprovalStatus) {
          return next(new AppError(400, 'employeeId, otMinutes, and otApprovalStatus are required', 'VALIDATION_ERROR'));
        }

        const record = createOtApprovalIfNeeded({
          employeeId,
          otMinutes:        Number(otMinutes),
          otApprovalStatus: otApprovalStatus as 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED',
        });

        if (!record) {
          return ok(res, null, 'No approval record required (status is not PENDING)');
        }

        return created(res, record);
      }

      return next(new AppError(400, "type must be 'LATE' or 'OT'", 'VALIDATION_ERROR'));
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /attendance-approvals ────────────────────────────────────────────────
//
// Managers/HR: returns all PENDING records (default) or filtered by ?status=
// Employees: returns their own records only

router.get(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, userId } = req.user!;

      // Employees only see their own approvals
      if (role === 'employee' || role === 'part_time') {
        return ok(res, listApprovalsForEmployee(userId));
      }

      // Managers / HR / super_admin can filter by status
      const status = (req.query.status as string | undefined)?.toUpperCase();

      if (!status || status === 'PENDING')  return ok(res, listPendingApprovals());
      if (status === 'APPROVED')            return ok(res, listApprovalsByStatus('APPROVED'));
      if (status === 'REJECTED')            return ok(res, listApprovalsByStatus('REJECTED'));
      if (status === 'ALL')                 return ok(res, listAllApprovals());

      return next(new AppError(400, "status must be 'PENDING', 'APPROVED', 'REJECTED', or 'ALL'", 'VALIDATION_ERROR'));
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /attendance-approvals/:id ───────────────────────────────────────────

router.get(
  '/:id',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, userId } = req.user!;
      const record = getApprovalById(req.params.id);

      if (!record) return notFoundResponse(res, 'Approval record not found');

      // Employees can only view their own records
      if ((role === 'employee' || role === 'part_time') && record.employeeId !== userId) {
        return next(new AppError(403, 'Access to this resource is not allowed', 'FORBIDDEN'));
      }

      return ok(res, record);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /attendance-approvals/:id ─────────────────────────────────────────
//
// Manager / HR / super_admin only.
// Body: { "status": "APPROVED" | "REJECTED" }

router.patch(
  '/:id',
  requireRole(['super_admin', 'admin', 'hr_branch', 'manager']),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body as { status?: string };
      const reviewerId = req.user!.userId;

      if (status !== 'APPROVED' && status !== 'REJECTED') {
        return next(new AppError(400, "status must be 'APPROVED' or 'REJECTED'", 'VALIDATION_ERROR'));
      }

      const updated = reviewApproval(req.params.id, status, reviewerId);
      return ok(res, updated);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
