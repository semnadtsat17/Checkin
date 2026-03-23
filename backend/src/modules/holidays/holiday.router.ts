import { Router } from 'express';
import { authenticate }  from '../../shared/middleware/auth';
import { requireRole }   from '../../shared/middleware/requireRole';
import * as ctrl         from './holiday.controller';

const router = Router();

// ── Holiday Types ─────────────────────────────────────────────────────────────
router.get(   '/types',             authenticate,                    ctrl.listTypes);
router.post(  '/types',             authenticate, requireRole('hr'), ctrl.createType);
router.patch( '/types/:id',         authenticate, requireRole('hr'), ctrl.updateType);
router.delete('/types/:id',         authenticate, requireRole('hr'), ctrl.deleteType);

// ── Holiday Dates (nested under a type) ───────────────────────────────────────
router.get(   '/types/:id/dates',   authenticate,                    ctrl.listDates);
router.post(  '/types/:id/dates',   authenticate, requireRole('hr'), ctrl.createDate);
router.post(  '/types/:id/presets', authenticate, requireRole('hr'), ctrl.loadPresets);

// ── Holiday Date mutations (by date id) ───────────────────────────────────────
router.patch( '/dates/:id',         authenticate, requireRole('hr'), ctrl.updateDate);
router.delete('/dates/:id',         authenticate, requireRole('hr'), ctrl.deleteDate);

export default router;
