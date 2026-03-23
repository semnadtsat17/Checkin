import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AppError } from './errorHandler';
import type { AuthPayload } from '../../types/express';

/**
 * Verifies the Bearer JWT in the Authorization header.
 * On success: attaches decoded payload to req.user and calls next().
 * On failure: throws AppError(401).
 *
 * Usage:
 *   router.get('/profile', authenticate, myController)
 *   router.use(authenticate)              // protect all routes in a router
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'No token provided', 'UNAUTHORIZED'));
  }

  const token = header.slice(7); // strip "Bearer "

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'Token expired', 'TOKEN_EXPIRED'));
    }
    return next(new AppError(401, 'Invalid token', 'INVALID_TOKEN'));
  }
}

/**
 * Generates a signed JWT for a user.
 * Called from the auth/login controller (future step).
 */
export function signToken(payload: AuthPayload, expiresIn = '8h'): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn } as jwt.SignOptions);
}
