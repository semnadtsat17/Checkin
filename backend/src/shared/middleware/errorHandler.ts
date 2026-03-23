import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Unexpected error — hide internals in production
  console.error('[error]', err.stack ?? err.message);
  res.status(500).json({
    success: false,
    error: config.nodeEnv === 'production' ? 'Internal Server Error' : err.message,
  });
}
