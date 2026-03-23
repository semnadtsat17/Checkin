import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './branch.controller';

const router = Router();

router.use(authenticate);

// Read: HR and above can list / view branches
router.get('/',    requireRole('hr'), ctrl.list);
router.get('/:id', requireRole('hr'), ctrl.getOne);

// Write: super_admin only
router.post('/',               requireRole('super_admin'), ctrl.create);
router.patch('/:id',           requireRole('super_admin'), ctrl.update);
router.patch('/:id/gps',       requireRole('super_admin'), ctrl.setGps);
router.delete('/:id/gps',      requireRole('super_admin'), ctrl.clearGps);
router.delete('/:id',          requireRole('super_admin'), ctrl.remove);

export default router;
