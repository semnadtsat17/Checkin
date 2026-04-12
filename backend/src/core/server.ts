/**
 * Express application factory.
 * Composes middleware and mounts the central router.
 * Exported as a factory function so it can be instantiated in tests.
 */
import express, { Application } from 'express';
import cors from 'cors';
import path from 'path';
import { config } from '../config';
import { logger } from '../shared/middleware/logger';
import { notFound } from '../shared/middleware/notFound';
import { errorHandler } from '../shared/middleware/errorHandler';
import { createRouter } from './router';
import devRouter        from '../modules/dev/dev.router';

export function createApp(): Application {
  const app = express();

  // ── Request middleware ────────────────────────────────────────────────────
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(logger);

  // ── Static: uploaded photos ───────────────────────────────────────────────
  app.use('/photos', express.static(path.join(config.dataDir, 'photos')));

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api', createRouter());

  // ── Dev-only routes (never mounted in production) ─────────────────────────
  // The route does not exist at all when NODE_ENV=production — an attacker
  // cannot even discover it.  devOnlyGuard inside the router is a second barrier.
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/dev', devRouter);
  }

  // ── 404 + error handlers (must be last) ──────────────────────────────────
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
