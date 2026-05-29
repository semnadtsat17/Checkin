import { Router } from 'express';
import { authenticate }  from '../../shared/middleware/auth';
import { requireRole }   from '../../shared/middleware/requireRole';
import * as ctrl         from './overtime.controller';

const router = Router();

router.use(authenticate);

// Employee: submit and manage own requests
router.get('/my',   ctrl.listMy);
router.post('/',    ctrl.create);
router.delete('/:id', ctrl.cancel);

// Manager+: view all and approve/reject
router.get('/',       requireRole(['admin', 'hr_branch', 'manager']), ctrl.list);
router.get('/:id',    requireRole(['admin', 'hr_branch', 'manager']), ctrl.getOne);
router.patch('/:id/status', requireRole(['admin', 'hr_branch', 'manager']), ctrl.updateStatus);

export default router;
