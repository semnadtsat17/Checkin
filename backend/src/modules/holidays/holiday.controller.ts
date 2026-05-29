import type { Request, Response, NextFunction } from 'express';
import { ok, created } from '../../shared/utils/response';
import { holidayService } from './holiday.service';

// ── Holiday Types ─────────────────────────────────────────────────────────────

export async function listTypes(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const branchId = (req.query.branchId as string | undefined) ?? req.user?.branchId;
    ok(res, holidayService.listTypes(branchId));
  } catch (err) { next(err); }
}

export async function createType(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const dto = { ...req.body, branchId: req.body.branchId ?? req.user!.branchId };
    created(res, holidayService.createType(dto, req.user!.role));
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
