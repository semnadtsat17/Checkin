import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import { config } from '../../config';

export function getHealth(_req: Request, res: Response): void {
  ok(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: config.nodeEnv,
    version: process.env.npm_package_version ?? '1.0.0',
  });
}
