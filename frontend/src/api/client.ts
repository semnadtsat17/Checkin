/**
 * Centralized API client.
 *
 * All frontend → backend communication goes through `apiFetch` or
 * `apiFetchMultipart`. Both functions:
 *   - Attach the JWT from localStorage as a Bearer header
 *   - Normalize "24:00" → "00:00" in JSON bodies (safety net)
 *   - Parse the standard { success, data, error } envelope
 *   - Throw a typed `ApiError` on failure
 *   - Emit `auth:unauthorized` on 401 so AuthContext can clear state
 */

import { normalizeTimeInput } from '../utils/timeCanonical';

// ─── Typed error ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Auth header ──────────────────────────────────────────────────────────────

/** Exported so `apiFetchMultipart` (FormData) can attach the token without
 *  accidentally overriding the multipart Content-Type boundary. */
export function authHeader(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── 401 signal ───────────────────────────────────────────────────────────────

/** Clears local storage and fires an event that AuthContext listens to,
 *  avoiding a circular import between this module and React context. */
function handleUnauthorized(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('auth_user');
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}

// ─── Response parser ──────────────────────────────────────────────────────────

async function parseEnvelope<T>(res: Response): Promise<T> {
  let body: { success: boolean; data?: T; error?: string; message?: string };

  try {
    body = await res.json();
  } catch {
    throw new ApiError(res.status, `HTTP ${res.status}: unexpected non-JSON response`);
  }

  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError(401, body.error ?? 'Unauthorized');
  }

  if (!body.success) {
    throw new ApiError(res.status, body.error ?? body.message ?? `HTTP ${res.status}`);
  }

  return body.data as T;
}

// ─── Time normalization interceptor ──────────────────────────────────────────

/**
 * Rewrite "24:00" → "00:00" in a JSON request body string.
 *
 * "24:00" is a display-only label produced by TimePicker's endMode.
 * The backend must never receive it.  This is a belt-and-suspenders guard;
 * the primary normalization happens at the component level.
 *
 * Only `startTime` and `endTime` fields are touched — no other fields.
 * If the body is not valid JSON it is returned unchanged.
 */
function normalizePayloadTimes(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== 'string' || !body) return body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return body;

    let changed = false;
    if (typeof parsed.startTime === 'string' && parsed.startTime === '24:00') {
      parsed.startTime = normalizeTimeInput(parsed.startTime);
      changed = true;
    }
    if (typeof parsed.endTime === 'string' && parsed.endTime === '24:00') {
      parsed.endTime = normalizeTimeInput(parsed.endTime);
      changed = true;
    }
    if (!changed) return body;

    // ─── PHASE 6: Time debug log ───────────────────────────────────────────────
    console.log('[TIME DEBUG] "24:00" normalized in payload', parsed);
    // ──────────────────────────────────────────────────────────────────────────
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

// ─── JSON requests ────────────────────────────────────────────────────────────

/** Use for all JSON API calls (GET, POST, PUT, PATCH, DELETE with JSON body). */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const safeBody = normalizePayloadTimes(options.body);

  // ─── PHASE 2: API client trace ──────────────────────────────────────────────
  console.log('[API REQUEST]', options.method ?? 'GET', path, safeBody ?? '');
  // ───────────────────────────────────────────────────────────────────────────
  const res = await fetch(path, {
    ...options,
    body: safeBody,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  // ─── PHASE 2: log raw response before JSON parse ────────────────────────────
  console.log('[API RESPONSE STATUS]', options.method ?? 'GET', path, res.status);
  const text = await res.clone().text();
  console.log('[API RESPONSE BODY]', text.slice(0, 500));
  // ───────────────────────────────────────────────────────────────────────────
  return parseEnvelope<T>(res);
}

// ─── Multipart / FormData requests ───────────────────────────────────────────

/**
 * Use for file-upload endpoints (check-in / check-out photos).
 * Does NOT set Content-Type — browser fills in the multipart boundary.
 */
export async function apiFetchMultipart<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...authHeader(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  return parseEnvelope<T>(res);
}
