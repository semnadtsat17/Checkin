import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './edit-request.controller';

const router = Router();

router.use(authenticate);

// Manager submits + views own requests; HR views all
router.post('/',    requireRole('manager'), ctrl.create);
router.get('/',     requireRole('manager'), ctrl.list);
router.get('/:id',  requireRole('manager'), ctrl.getOne);

// HR only — approve / reject
router.patch('/:id/approve', requireRole('hr'), ctrl.approve);
router.patch('/:id/reject',  requireRole('hr'), ctrl.reject);

export default router;
