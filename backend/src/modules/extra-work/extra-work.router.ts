import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './extra-work.controller';

const router = Router();

// Employee self-service
router.get('/my',           authenticate, ctrl.getMy);

// Manager / HR managed routes
router.get('/',             authenticate, requireRole(['manager', 'hr', 'super_admin']), ctrl.list);
router.post('/',            authenticate, requireRole(['manager', 'hr', 'super_admin']), ctrl.create);
router.get('/:id',          authenticate, requireRole(['manager', 'hr', 'super_admin']), ctrl.getOne);
router.patch('/:id',        authenticate, requireRole(['manager', 'hr', 'super_admin']), ctrl.update);
router.delete('/:id',       authenticate, requireRole(['manager', 'hr', 'super_admin']), ctrl.remove);

export { router as extraWorkRouter };
