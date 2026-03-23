import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole } from '../../shared/middleware/requireRole';
import { uploadPhoto } from '../../shared/middleware/upload';
import * as ctrl from './attendance.controller';

const router = Router();

router.use(authenticate);

// ── Employee / Part-time ───────────────────────────────────────────────────────
// Check-in and check-out use multer to accept multipart/form-data (photo + GPS).
// Both 'employee' and 'part_time' roles are allowed (they are siblings in the
// hierarchy, so requireRole('employee') alone would block part_time workers).
router.post('/check-in',  requireRole(['employee', 'part_time']), uploadPhoto, ctrl.checkIn);
router.post('/check-out', requireRole(['employee', 'part_time']), uploadPhoto, ctrl.checkOut);

// Own records
router.get('/today',       requireRole(['employee', 'part_time']), ctrl.getToday);
router.get('/me',          requireRole(['employee', 'part_time']), ctrl.getMyRecords);
router.get('/summary/me',  requireRole(['employee', 'part_time']), ctrl.getMySummary);

// ── Manager / HR ──────────────────────────────────────────────────────────────
// Summary routes registered BEFORE /:id to prevent Express treating "summary" as an id param.
router.get('/summary/:userId', requireRole('manager'), ctrl.getSummaryForUser);
router.get('/',    requireRole('manager'), ctrl.list);
router.get('/:id', requireRole('manager'), ctrl.getOne);

// Approval / rejection of pending_approval records
router.patch('/:id/approve', requireRole('manager'), ctrl.approve);
router.patch('/:id/reject',  requireRole('manager'), ctrl.reject);

export default router;
