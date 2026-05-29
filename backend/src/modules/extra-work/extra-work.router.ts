import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './extra-work.controller';

const router = Router();

// Employee self-service
router.get('/my',           authenticate, ctrl.getMy);

// Manager / HR managed routes
router.get('/',             authenticate, requireRole(['super_admin', 'admin', 'hr_branch', 'manager']), ctrl.list);
router.post('/',            authenticate, requireRole(['super_admin', 'admin', 'hr_branch', 'manager']), ctrl.create);
router.get('/:id',          authenticate, requireRole(['super_admin', 'admin', 'hr_branch', 'manager']), ctrl.getOne);
router.patch('/:id',        authenticate, requireRole(['super_admin', 'admin', 'hr_branch', 'manager']), ctrl.update);
router.delete('/:id',       authenticate, requireRole(['super_admin', 'admin', 'hr_branch', 'manager']), ctrl.remove);

export { router as extraWorkRouter };
