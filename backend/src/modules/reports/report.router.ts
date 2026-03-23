import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './report.controller';

const router = Router();

router.use(authenticate);

router.get('/weekly',            requireRole('manager'), ctrl.weekly);
router.get('/monthly',           requireRole('manager'), ctrl.monthly);
router.get('/planned-vs-actual', requireRole('manager'), ctrl.plannedVsActual);
router.get('/pending-approvals', requireRole('manager'), ctrl.pendingApprovals);

export default router;
