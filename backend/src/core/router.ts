/**
 * Central route registry.
 * Every module registers its router here — single place to audit all routes.
 */
import { Router } from 'express';
import authRouter        from '../modules/auth/auth.router';
import healthRouter      from '../modules/health/health.router';
import departmentsRouter from '../modules/departments/department.router';
import employeesRouter   from '../modules/employees/employee.router';
import subRolesRouter    from '../modules/employees/sub-role.router';
import schedulesRouter   from '../modules/schedules/schedule.router';
import branchesRouter    from '../modules/branches/branch.router';
import attendanceRouter   from '../modules/attendance/attendance.router';
import editRequestsRouter from '../modules/edit-requests/edit-request.router';
import reportsRouter      from '../modules/reports/report.router';
import { extraWorkRouter }       from '../modules/extra-work/extra-work.router';
import scheduleApprovalsRouter   from '../modules/schedule-approvals/schedule-approval.router';
import notificationsRouter       from '../modules/notifications/notification.router';
import holidaysRouter            from '../modules/holidays/holiday.router';
import orgSettingsRouter         from '../modules/org-settings/org-settings.router';

export function createRouter(): Router {
  const router = Router();

  // ── Module routes ─────────────────────────────────────────────────────────
  router.use('/auth',          authRouter);
  router.use('/health',         healthRouter);
  router.use('/departments',    departmentsRouter);
  router.use('/employees',      employeesRouter);
  router.use('/work-schedule-patterns', subRolesRouter);
  router.use('/schedules',      schedulesRouter);
  router.use('/branches',       branchesRouter);
  router.use('/attendance',     attendanceRouter);
  router.use('/edit-requests',  editRequestsRouter);
  router.use('/reports',        reportsRouter);
  router.use('/extra-work',          extraWorkRouter);
  router.use('/schedule-approvals',  scheduleApprovalsRouter);
  router.use('/notifications',       notificationsRouter);
  router.use('/holidays',            holidaysRouter);
  router.use('/org-settings',        orgSettingsRouter);

  // Future modules register here:
  // router.use('/auth',       authRouter);
  // router.use('/overtime',   overtimeRouter);

  return router;
}
