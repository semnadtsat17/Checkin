/**
 * devOnly.guard.ts
 *
 * Express middleware that hard-blocks any request when NODE_ENV === 'production'.
 *
 * This guard is a SECOND line of defence.  The FIRST line is the conditional
 * router.use() in server.ts — the route literally does not exist in production.
 * This guard exists so that if someone accidentally copies the dev router
 * registration without the NODE_ENV condition, every request is still refused.
 *
 * Usage:
 *   router.use(devOnlyGuard);
 *   router.post('/reset-attendance-mode', ...);
 */
import type { Request, Response, NextFunction } from 'express';

export function devOnlyGuard(_req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      success: false,
      error:   'DEV_ENDPOINT_FORBIDDEN',
      message: 'This endpoint is not available in production.',
    });
    return;
  }
  next();
}
