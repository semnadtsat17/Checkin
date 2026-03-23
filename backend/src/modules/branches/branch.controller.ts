import { Request, Response, NextFunction } from 'express';
import { branchService } from './branch.service';
import { ok, created } from '../../shared/utils/response';

// GET /branches
export function list(req: Request, res: Response, next: NextFunction) {
  try {
    const isActive = req.query.isActive !== undefined
      ? req.query.isActive === 'true'
      : undefined;
    const search = req.query.search as string | undefined;

    const items = branchService.findAll({ isActive, search });
    ok(res, items);
  } catch (e) { next(e); }
}

// GET /branches/:id
export function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, branchService.findById(req.params.id));
  } catch (e) { next(e); }
}

// POST /branches
export function create(req: Request, res: Response, next: NextFunction) {
  try {
    created(res, branchService.create(req.body));
  } catch (e) { next(e); }
}

// PATCH /branches/:id
export function update(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, branchService.update(req.params.id, req.body));
  } catch (e) { next(e); }
}

// PATCH /branches/:id/gps  — set or replace GPS fence
export function setGps(req: Request, res: Response, next: NextFunction) {
  try {
    const { latitude, longitude, radiusMeters } = req.body as {
      latitude: number; longitude: number; radiusMeters: number;
    };
    ok(res, branchService.setGps(req.params.id, latitude, longitude, radiusMeters));
  } catch (e) { next(e); }
}

// DELETE /branches/:id/gps  — remove GPS fence
export function clearGps(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, branchService.clearGps(req.params.id));
  } catch (e) { next(e); }
}

// DELETE /branches/:id
export function remove(req: Request, res: Response, next: NextFunction) {
  try {
    branchService.remove(req.params.id);
    ok(res, null, 'Branch deleted');
  } catch (e) { next(e); }
}
