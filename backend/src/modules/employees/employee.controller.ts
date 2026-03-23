import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@hospital-hr/shared';
import { hasPermission } from '../../core/permissions';
import { ok, created, noContent, paginated } from '../../shared/utils/response';
import { employeeService } from './employee.service';
import { authService } from '../auth/auth.service';

// ─── List ──────────────────────────────────────────────────────────────────────
// GET /api/employees
// Query: departmentId?, branchId?, role?, isActive?, search?, page?, pageSize?
//
// Branch restriction: manager is forced to their own branchId

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const allowCrossBranch = hasPermission(user.role, 'hr');

    const branchId = allowCrossBranch
      ? (req.query.branchId as string | undefined)
      : user.branchId;

    const isActiveRaw = req.query.isActive as string | undefined;
    const isActive =
      isActiveRaw === 'true'  ? true  :
      isActiveRaw === 'false' ? false :
      undefined;

    const result = employeeService.findAll({
      branchId,
      departmentId: req.query.departmentId as string | undefined,
      role:         req.query.role as UserRole | undefined,
      isActive,
      search:       req.query.search   as string | undefined,
      page:         req.query.page     ? parseInt(req.query.page     as string, 10) : 1,
      pageSize:     req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20,
    });

    paginated(res, result);
  } catch (err) {
    next(err);
  }
}

// ─── Get One ───────────────────────────────────────────────────────────────────
// GET /api/employees/:id

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = employeeService.findById(req.params.id);
    ok(res, employee);
  } catch (err) {
    next(err);
  }
}

// ─── Create ────────────────────────────────────────────────────────────────────
// POST /api/employees

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await employeeService.create(req.body, req.user!.role);
    created(res, result, 'Employee created');
  } catch (err) {
    next(err);
  }
}

// ─── Update ────────────────────────────────────────────────────────────────────
// PUT /api/employees/:id

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = employeeService.update(req.params.id, req.body);
    ok(res, employee, 'Employee updated');
  } catch (err) {
    next(err);
  }
}

// ─── Assign Role ───────────────────────────────────────────────────────────────
// PATCH /api/employees/:id/role
// Body: { role: UserRole, subRoleId?: string | null }

export async function assignRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = employeeService.assignRole(req.params.id, req.body, req.user!.role);
    ok(res, employee, 'Role assigned');
  } catch (err) {
    next(err);
  }
}

// ─── Reset password (HR) ───────────────────────────────────────────────────────
// POST /api/employees/:id/reset-password

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const temporaryPassword = await authService.resetPassword(req.params.id);
    ok(res, { temporaryPassword }, 'Password reset successfully');
  } catch (err) {
    next(err);
  }
}

// ─── Update Manager Departments (HR) ──────────────────────────────────────────
// PATCH /api/employees/:id/manager-departments
// Body: { departmentIds: string[] }

export async function updateManagerDepartments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const employee = employeeService.updateManagerDepartments(req.params.id, req.body.departmentIds ?? []);
    ok(res, employee, 'Manager departments updated');
  } catch (err) {
    next(err);
  }
}

// ─── Transfer Department ───────────────────────────────────────────────────────
// POST /api/employees/:id/transfer-department
// Body: { newDepartmentId: string; effectiveDate: string /* YYYY-MM-DD */ }
//
// Migrates the employee's schedule to the new department rules, starting from
// effectiveDate. Past records (before effectiveDate) are never modified.

export async function transferDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { newDepartmentId, effectiveDate } = req.body as {
      newDepartmentId?: string;
      effectiveDate?:   string;
    };
    if (!newDepartmentId) {
      res.status(400).json({ success: false, error: 'newDepartmentId is required' });
      return;
    }
    if (!effectiveDate) {
      res.status(400).json({ success: false, error: 'effectiveDate is required' });
      return;
    }
    const result = employeeService.transferDepartment(
      req.params.id,
      newDepartmentId,
      effectiveDate,
      req.user!.userId,
    );
    ok(res, result, 'Department transfer completed');
  } catch (err) {
    next(err);
  }
}

// ─── Remove (soft-delete) ──────────────────────────────────────────────────────
// DELETE /api/employees/:id

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    employeeService.remove(req.params.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
}
