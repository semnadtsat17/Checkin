import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import * as ctrl from './notification.controller';

const router = Router();
router.use(authenticate);

router.get('/',              ctrl.list);
router.get('/unread-count',  ctrl.unreadCount);
router.patch('/read-all',    ctrl.markAllRead);
router.patch('/:id/read',    ctrl.markRead);

export default router;
