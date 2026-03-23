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
router.post('/',                              requireRole('hr'), ctrl.create);
router.put('/:id',                            requireRole('hr'), ctrl.update);
router.patch('/:id/role',                     requireRole('hr'), ctrl.assignRole);
router.patch('/:id/manager-departments',      requireRole('hr'), ctrl.updateManagerDepartments);
router.post('/:id/reset-password',            requireRole('hr'), ctrl.resetPassword);
router.post('/:id/transfer-department',       requireRole('hr'), ctrl.transferDepartment);
router.delete('/:id',                         requireRole('hr'), ctrl.remove);

export default router;
