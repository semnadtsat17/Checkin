import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import * as ctrl from './auth.controller';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/login', ctrl.login);

// ── Authenticated ─────────────────────────────────────────────────────────────
router.get('/me',                authenticate, ctrl.me);
router.patch('/me/password',     authenticate, ctrl.changePassword);
router.get('/branches',          authenticate, ctrl.listBranches);
router.post('/select-branch',    authenticate, ctrl.selectBranch);

// ── HR / super_admin — set or reset any employee's password ───────────────────
router.patch('/password/:userId', authenticate, requireRole(['admin', 'hr_branch']), ctrl.setPassword);

export default router;
