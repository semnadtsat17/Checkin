import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './department.controller';

const router = Router();

// All department routes require authentication
router.use(authenticate);

// ── Read  (manager and above — includes hr, super_admin) ──────────────────────
router.get('/',    requireRole('manager'), ctrl.list);
router.get('/:id', requireRole('manager'), ctrl.getOne);

// ── Write (HR and above only) ─────────────────────────────────────────────────
router.post('/',    requireRole(['admin', 'hr_branch']), ctrl.create);
router.put('/:id',  requireRole(['admin', 'hr_branch']), ctrl.update);
router.delete('/:id', requireRole(['admin', 'hr_branch']), ctrl.remove);

export default router;
