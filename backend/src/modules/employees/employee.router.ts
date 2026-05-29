import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './employee.controller';

const router = Router();

router.use(authenticate);

// ── Read (manager+) ───────────────────────────────────────────────────────────
router.get('/',    requireRole('manager'), ctrl.list);
router.get('/:id', requireRole('manager'), ctrl.getOne);

// ── Write (HR+) ───────────────────────────────────────────────────────────────
router.post('/',                              requireRole(['admin', 'hr_branch']), ctrl.create);
router.put('/:id',                            requireRole(['admin', 'hr_branch']), ctrl.update);
router.patch('/:id/role',                     requireRole(['admin', 'hr_branch']), ctrl.assignRole);
router.patch('/:id/manager-departments',      requireRole(['admin', 'hr_branch']), ctrl.updateManagerDepartments);
router.post('/:id/reset-password',            requireRole(['admin', 'hr_branch']), ctrl.resetPassword);
router.post('/:id/transfer-department',       requireRole(['admin', 'hr_branch']), ctrl.transferDepartment);
router.delete('/:id',                         requireRole(['admin', 'hr_branch']), ctrl.remove);

export default router;
