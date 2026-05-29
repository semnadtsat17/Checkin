/**
 * leave.router.ts
 *
 * Route definitions for the leave module.
 * Registered at: /leave  (see core/router.ts)
 *
 * Access matrix:
 *
 *   POST   /leave                    any authenticated user (self) | manager (others)
 *   GET    /leave                    self | manager (dept-scoped) | hr (all)
 *   GET    /leave/range              manager (dept-scoped) | hr (all)
 *   GET    /leave/:id                manager | hr
 *   PATCH  /leave/:id/approve-manager  manager | hr
 *   PATCH  /leave/:id/approve-hr       hr only
 *   PATCH  /leave/:id/reject           manager (pending) | hr (any pre-terminal)
 */
import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth';
import { requireRole }   from '../../shared/middleware/requireRole';
import * as ctrl from './leave.controller';

const router = Router();
router.use(authenticate);

// ── Employee-facing ───────────────────────────────────────────────────────────
// Any employee can submit a leave request for themselves.
router.post('/', requireRole(['employee', 'part_time', 'super_admin', 'admin', 'hr_branch', 'manager']), ctrl.create);

// List own records (employees) or dept/all records (manager+)
router.get('/', requireRole(['employee', 'part_time', 'super_admin', 'admin', 'hr_branch', 'manager']), ctrl.list);

// ── /range must come before /:id to avoid Express treating "range" as an id ──
router.get('/range', requireRole('manager'), ctrl.listByDateRange);

// Single record — manager and above only (employees use GET / with own userId)
router.get('/:id', requireRole('manager'), ctrl.getOne);

// ── Approval / rejection ─────────────────────────────────────────────────────
router.patch('/:id/approve-manager', requireRole('manager'), ctrl.approveByManager);
router.patch('/:id/approve-hr',      requireRole(['admin', 'hr_branch']),      ctrl.approveByHR);
router.patch('/:id/reject',          requireRole('manager'), ctrl.reject);

export default router;
