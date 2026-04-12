/**
 * useRealtime.ts
 *
 * React hook that opens a persistent Server-Sent Events connection to
 * GET /api/realtime/stream and dispatches incoming events to caller-supplied
 * callbacks.
 *
 * Design goals:
 *   - Single connection per component mount (not per render).
 *   - Callbacks are always fresh: no stale-closure problem — the hook stores
 *     them in a ref that is updated after every render.
 *   - Graceful reconnect: exponential backoff (1 s → 2 s → … → 30 s max)
 *     resets to 1 s on a successful open.
 *   - Clean teardown: EventSource is closed and the retry timer is cancelled
 *     when the component unmounts.
 *
 * Auth:
 *   Native EventSource does not support custom headers, so the JWT is passed
 *   as ?token= in the URL.  The backend verifies it before opening the stream.
 *
 * Usage:
 *   useRealtime({
 *     onApprovalCreated: (record) => { ... },
 *     onApprovalUpdated: (record) => { ... },
 *     onNotification:    (notif)  => { ... },
 *   });
 */
import { useEffect, useRef } from 'react';
import type { AppNotification } from '@hospital-hr/shared';
import type { AttendanceApproval } from '../api/approvals';

// ─── Public callback contract ─────────────────────────────────────────────────

export type RealtimeCallbacks = {
  /** A new PENDING approval request was created (managers / HR). */
  onApprovalCreated?: (record: AttendanceApproval) => void;
  /** An approval was reviewed — APPROVED or REJECTED (managers + the employee). */
  onApprovalUpdated?: (record: AttendanceApproval) => void;
  /** A new notification was pushed for the authenticated user. */
  onNotification?: (notif: AppNotification) => void;
};

const SSE_URL       = '/api/realtime/stream';
const MAX_RETRY_MS  = 30_000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRealtime(callbacks: RealtimeCallbacks): void {
  // Keep a mutable ref to the latest callbacks so the EventSource handler
  // never closes over a stale version — no dependency array needed.
  const cbRef = useRef<RealtimeCallbacks>(callbacks);
  useEffect(() => {
    cbRef.current = callbacks;
  }); // intentionally no deps — runs after every render

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return; // not authenticated — nothing to do

    let currentEs: EventSource | null = null;
    let retryDelay  = 1_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed   = false;

    function connect() {
      if (destroyed) return;

      const url = `${SSE_URL}?token=${encodeURIComponent(token!)}`;
      const es   = new EventSource(url);
      currentEs  = es;

      es.addEventListener('open', () => {
        retryDelay = 1_000; // reset backoff on successful connection
      });

      es.addEventListener('approval_created', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as AttendanceApproval;
          cbRef.current.onApprovalCreated?.(data);
        } catch { /* malformed event — ignore */ }
      });

      es.addEventListener('approval_updated', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as AttendanceApproval;
          cbRef.current.onApprovalUpdated?.(data);
        } catch { /* malformed event — ignore */ }
      });

      es.addEventListener('notification', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as AppNotification;
          cbRef.current.onNotification?.(data);
        } catch { /* malformed event — ignore */ }
      });

      es.addEventListener('error', () => {
        // EventSource already closed on error — don't call es.close() again
        currentEs = null;
        if (!destroyed) {
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
        }
      });
    }

    connect();

    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      currentEs?.close();
    };
  }, []); // empty deps — connection established once per component mount
}
