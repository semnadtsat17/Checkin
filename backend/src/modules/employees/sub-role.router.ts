import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole'; // used for write routes
import * as ctrl from './sub-role.controller';

const router = Router();

router.use(authenticate);

// ── Read (any authenticated user — employees need shift data for /my-schedule) ──
router.get('/',    ctrl.list);
router.get('/:id', ctrl.getOne);

// ── Write (HR+) ───────────────────────────────────────────────────────────────
router.post('/',    requireRole('hr'), ctrl.create);
router.put('/:id',  requireRole('hr'), ctrl.update);
router.delete('/:id', requireRole('hr'), ctrl.remove);

export default router;
