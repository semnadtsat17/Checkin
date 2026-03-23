import type { Request, Response, NextFunction } from 'express';
import { ok, created } from '../../shared/utils/response';
import { holidayService } from './holiday.service';

// ── Holiday Types ─────────────────────────────────────────────────────────────

export async function listTypes(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    ok(res, holidayService.listTypes());
  } catch (err) { next(err); }
}

export async function createType(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    created(res, holidayService.createType(req.body, req.user!.role));
  } catch (err) { next(err); }
}

export async function updateType(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    ok(res, holidayService.updateType(req.params.id, req.body, req.user!.role));
  } catch (err) { next(err); }
}

export async function deleteType(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    holidayService.deleteType(req.params.id, req.user!.role);
    ok(res, null);
  } catch (err) { next(err); }
}

// ── Holiday Dates ─────────────────────────────────────────────────────────────

export async function listDates(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    ok(res, holidayService.listDates(req.params.id));
  } catch (err) { next(err); }
}

export async function createDate(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    created(res, holidayService.createDate(req.params.id, req.body, req.user!.role));
  } catch (err) { next(err); }
}

export async function loadPresets(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    ok(res, holidayService.loadPresets(req.params.id, req.user!.role));
  } catch (err) { next(err); }
}

export async function updateDate(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    ok(res, holidayService.updateDate(req.params.id, req.body, req.user!.role));
  } catch (err) { next(err); }
}

export async function deleteDate(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    holidayService.deleteDate(req.params.id, req.user!.role);
    ok(res, null);
  } catch (err) { next(err); }
}
