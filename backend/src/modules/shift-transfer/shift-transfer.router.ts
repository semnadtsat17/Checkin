import { Router } from 'express';
import { authenticate }  from '../../shared/middleware/auth';
import { requireRole }   from '../../shared/middleware/requireRole';
import * as ctrl         from './shift-transfer.controller';

const router = Router();

router.use(authenticate);

// Employee: create, view own, cancel
router.post('/',         ctrl.create);
router.get('/my',        ctrl.listMy);
router.delete('/:id',    ctrl.cancel);

// Receiver: accept or decline
router.patch('/:id/respond', ctrl.respond);

// Manager+: view all, approve/reject
router.get('/',                               requireRole(['admin', 'hr_branch', 'manager']), ctrl.list);
router.get('/:id',                            requireRole(['admin', 'hr_branch', 'manager']), ctrl.getOne);
router.patch('/:id/manager-decision',         requireRole(['admin', 'hr_branch', 'manager']), ctrl.managerDecision);

export default router;
