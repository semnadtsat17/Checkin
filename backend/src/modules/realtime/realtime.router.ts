/**
 * realtime.router.ts
 *
 * GET /api/realtime/stream
 *
 * Server-Sent Events endpoint.  Clients connect once and receive push events
 * for approval_created, approval_updated, and notification without polling.
 *
 * Auth: standard JWT, passed as ?token= query param because the browser's
 * native EventSource API does not support custom request headers.
 *
 * Event format:
 *   event: approval_created | approval_updated | notification
 *   id: <record id>          (used for browser-side Last-Event-ID tracking)
 *   data: <JSON payload>
 *
 * Keepalive: a ": keepalive" SSE comment is sent every 25 s.  This prevents
 * proxies / load-balancers from closing idle connections.
 */
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { registerClient, unregisterClient } from './realtime.service';
import type { AuthPayload } from '../../types/express';

const router = Router();

const HEARTBEAT_MS = 25_000;

// ─── GET /stream ──────────────────────────────────────────────────────────────

router.get('/stream', (req: Request, res: Response) => {
  // ── 1. Authenticate via query param token ────────────────────────────────────
  const rawToken = req.query.token as string | undefined;

  if (!rawToken) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }

  let payload: AuthPayload;
  try {
    payload = jwt.verify(rawToken, config.jwtSecret) as AuthPayload;
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  const { userId, role } = payload;

  // ── 2. SSE headers ───────────────────────────────────────────────────────────
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection',    'keep-alive');
  // Tell Nginx / proxies not to buffer the stream
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // ── 3. Initial retry hint + welcome heartbeat ────────────────────────────────
  // retry tells the browser how long to wait before reconnecting on error (ms)
  res.write('retry: 3000\n\n');
  res.write(': connected\n\n');

  // ── 4. Register this connection ──────────────────────────────────────────────
  registerClient(userId, role, res);

  // ── 5. Keepalive heartbeat ───────────────────────────────────────────────────
  // SSE comments (": text") are ignored by listeners but keep the TCP connection
  // alive through proxy timeouts.
  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    res.write(': keepalive\n\n');
  }, HEARTBEAT_MS);

  // ── 6. Cleanup on disconnect ─────────────────────────────────────────────────
  req.on('close', () => {
    clearInterval(heartbeat);
    unregisterClient(userId, res);
  });
});

export default router;
