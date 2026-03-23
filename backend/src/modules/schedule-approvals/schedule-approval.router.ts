import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './schedule-approval.controller';

const router = Router();
router.use(authenticate);

// /pending-count must come before /:id to avoid being captured as an id param
router.get('/pending-count',   requireRole('hr'),      ctrl.pendingCount);
router.get('/',                requireRole('manager'), ctrl.list);
router.post('/',               requireRole('manager'), ctrl.submit);
router.get('/:id',             requireRole('manager'), ctrl.getOne);
router.get('/:id/preview',     requireRole(['manager', 'hr']), ctrl.preview);
router.post('/:id/approve',    requireRole('hr'),      ctrl.approve);
router.post('/:id/reject',     requireRole('hr'),      ctrl.reject);

export default router;
