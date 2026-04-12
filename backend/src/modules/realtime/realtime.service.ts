/**
 * realtime.service.ts
 *
 * In-process SSE client registry.
 *
 * Keeps a map of   userId → [{ res, role }, ...]
 * so we can push events to individual users or to a role group.
 *
 * All public emit functions are FIRE-AND-FORGET — they catch and discard
 * every error so they never break the caller's main flow.
 */
import type { Response } from 'express';
import type { AttendanceApprovalRecord } from '../attendance/repositories/attendanceApprovalRepo';
import type { AppNotification } from '@hospital-hr/shared';

// ─── Client registry ──────────────────────────────────────────────────────────

type ClientEntry = {
  res:  Response;
  role: string;
};

// userId → open SSE connections (multiple browser tabs share the same userId)
const clients = new Map<string, ClientEntry[]>();

// ─── Registry helpers ─────────────────────────────────────────────────────────

export function registerClient(userId: string, role: string, res: Response): void {
  const existing = clients.get(userId) ?? [];
  clients.set(userId, [...existing, { res, role }]);
}

export function unregisterClient(userId: string, res: Response): void {
  const remaining = (clients.get(userId) ?? []).filter((e) => e.res !== res);
  if (remaining.length === 0) {
    clients.delete(userId);
  } else {
    clients.set(userId, remaining);
  }
}

// ─── Low-level write ──────────────────────────────────────────────────────────

function writeEvent(
  res:   Response,
  event: string,
  data:  unknown,
  id?:   string,
): void {
  if (res.writableEnded) return;
  const idLine = id ? `id: ${id}\n` : '';
  res.write(`event: ${event}\n${idLine}data: ${JSON.stringify(data)}\n\n`);
}

function emitToUser(userId: string, event: string, data: unknown, id?: string): void {
  const entries = clients.get(userId);
  if (!entries) return;
  for (const { res } of entries) {
    try { writeEvent(res, event, data, id); } catch { /* ignore write errors */ }
  }
}

function emitToRoles(roles: string[], event: string, data: unknown, id?: string): void {
  for (const [, entries] of clients) {
    for (const { res, role } of entries) {
      if (!roles.includes(role)) continue;
      try { writeEvent(res, event, data, id); } catch { /* ignore write errors */ }
    }
  }
}

// ─── Public emit helpers ──────────────────────────────────────────────────────

/**
 * A new PENDING approval was created.
 * Broadcast to every connected manager / hr user so their queue updates live.
 */
export function emitApprovalCreated(record: AttendanceApprovalRecord): void {
  try {
    emitToRoles(['manager', 'hr', 'super_admin'], 'approval_created', record, record.id);
  } catch { /* never propagate */ }
}

/**
 * An approval was reviewed (APPROVED or REJECTED).
 * - Managers / HR: remove it from their PENDING queue.
 * - The employee who owns the record: update their approval status.
 */
export function emitApprovalUpdated(record: AttendanceApprovalRecord): void {
  try {
    emitToRoles(['manager', 'hr', 'super_admin'], 'approval_updated', record, record.id);
    emitToUser(record.employeeId, 'approval_updated', record, record.id);
  } catch { /* never propagate */ }
}

/**
 * A notification was created for a specific user.
 * Push it to all of that user's open connections.
 */
export function emitNotification(notif: AppNotification): void {
  try {
    emitToUser(notif.userId, 'notification', notif, notif.id);
  } catch { /* never propagate */ }
}
