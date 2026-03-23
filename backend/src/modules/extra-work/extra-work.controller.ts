import type { Request, Response, NextFunction } from 'express';
import { ok, created } from '../../shared/utils/response';
import { extraWorkService } from './extra-work.service';
import type { ExtraWorkFilters } from './extra-work.service';

// ─── Time guard ───────────────────────────────────────────────────────────────

/**
 * Normalize "24:00" → "00:00" in the request body.
 * "24:00" is a frontend display label; the backend canonical form is "00:00".
 * assertTime() already rejects h > 23, so this must run first.
 */
function normalize2400(body: Record<string, unknown>): void {
  if (body.startTime === '24:00') {
    console.warn('[TIME NORMALIZED] 24:00 → 00:00 (startTime)');
    body.startTime = '00:00';
  }
  if (body.endTime === '24:00') {
    console.warn('[TIME NORMALIZED] 24:00 → 00:00 (endTime)');
    body.endTime = '00:00';
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters: ExtraWorkFilters = {
      employeeId:   req.query.employeeId   as string | undefined,
      departmentId: req.query.departmentId as string | undefined,
      date:         req.query.date         as string | undefined,
      from:         req.query.from         as string | undefined,
      to:           req.query.to           as string | undefined,
    };
    const data = extraWorkService.findAll(filters, req.user!.role, req.user!.userId);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getMy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = extraWorkService.getMyExtraWork(req.user!.userId, {
      date: req.query.date as string | undefined,
      from: req.query.from as string | undefined,
      to:   req.query.to   as string | undefined,
    });
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = extraWorkService.findById(req.params.id);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  // ─── PHASE 3: Controller trace ────────────────────────────────────────────
  console.log('[OT API] create ENTER');
  console.log('[OT API] BODY', req.body);
  // ─────────────────────────────────────────────────────────────────────────
  normalize2400(req.body);
  try {
    const data = extraWorkService.create(req.body, req.user!.role, req.user!.userId);
    console.log('[OT API] create SUCCESS');
    created(res, data);
  } catch (err) {
    console.error('[OT API] create ERROR', err);
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  // ─── PHASE 3: Controller trace ────────────────────────────────────────────
  console.log('[OT API] update ENTER id=', req.params.id);
  console.log('[OT API] BODY', req.body);
  // ─────────────────────────────────────────────────────────────────────────
  normalize2400(req.body);
  try {
    const data = extraWorkService.update(req.params.id, req.body, req.user!.role, req.user!.userId);
    console.log('[OT API] update SUCCESS');
    ok(res, data);
  } catch (err) {
    console.error('[OT API] update ERROR', err);
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  // ─── PHASE 3: Controller trace ────────────────────────────────────────────
  console.log('[OT API] remove ENTER id=', req.params.id);
  // ─────────────────────────────────────────────────────────────────────────
  try {
    extraWorkService.remove(req.params.id, req.user!.role, req.user!.userId);
    console.log('[OT API] remove SUCCESS');
    ok(res, null);
  } catch (err) {
    console.error('[OT API] remove ERROR', err);
    next(err);
  }
}
