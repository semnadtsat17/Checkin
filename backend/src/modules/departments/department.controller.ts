import { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../../core/permissions';
import {
  ok,
  created,
  noContent,
  paginated,
} from '../../shared/utils/response';
import { departmentService } from './department.service';

// ─── List ──────────────────────────────────────────────────────────────────────
// GET /api/departments
// Query: branchId?, isActive?, search?, page?, pageSize?
//
// Branch restriction:
//   HR / Super Admin → can filter by any branchId (or see all)
//   Manager          → forced to their own branchId

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;

    // HR and above may cross branches; manager is restricted to their own
    const allowCrossBranch = hasPermission(user.role, 'hr');
    const branchId = allowCrossBranch
      ? (req.query.branchId as string | undefined)
      : user.branchId;

    const isActiveRaw = req.query.isActive as string | undefined;
    const isActive =
      isActiveRaw === 'true'  ? true  :
      isActiveRaw === 'false' ? false :
      undefined; // omitted → return both active and inactive

    const result = departmentService.findAll({
      branchId,
      isActive,
      search:   req.query.search   as string | undefined,
      page:     req.query.page     ? parseInt(req.query.page as string, 10)     : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20,
    });

    paginated(res, result);
  } catch (err) {
    next(err);
  }
}

// ─── Get One ───────────────────────────────────────────────────────────────────
// GET /api/departments/:id

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dept = departmentService.findById(req.params.id);
    ok(res, dept);
  } catch (err) {
    next(err);
  }
}

// ─── Create ────────────────────────────────────────────────────────────────────
// POST /api/departments
// Body: { nameTh, nameEn?, branchId, managerId? }

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dept = departmentService.create(req.body);
    created(res, dept, 'Department created');
  } catch (err) {
    next(err);
  }
}

// ─── Update ────────────────────────────────────────────────────────────────────
// PUT /api/departments/:id
// Body: { nameTh?, nameEn?, branchId?, managerId?, isActive? }

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dept = departmentService.update(req.params.id, req.body);
    ok(res, dept, 'Department updated');
  } catch (err) {
    next(err);
  }
}

// ─── Remove (soft-delete) ──────────────────────────────────────────────────────
// DELETE /api/departments/:id

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    departmentService.remove(req.params.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
}
