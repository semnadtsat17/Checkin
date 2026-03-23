/**
 * DEVELOPER RULE — adding / renaming translation keys
 * ─────────────────────────────────────────────────────────────────────────────
 * The frontend (Vite) resolves @hospital-hr/shared directly from this source
 * file via a vite.config.ts alias, so JSON edits are picked up immediately
 * on the next hot-reload — no separate shared rebuild is required for the
 * frontend.
 *
 * However, the backend still imports from shared/dist/. After editing
 * th.json / en.json you should rebuild for backend consistency:
 *   npx tsc --project shared/tsconfig.json
 *
 * If a key is missing at runtime, a console.warn is emitted in development:
 *   [i18n] Missing translation key: "some.key" (locale: th)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import th from './th.json';
import en from './en.json';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Locale = 'th' | 'en';

/**
 * Recursively extract every possible dot-notation key from a nested object.
 * e.g. DeepKeys<{ a: { b: string } }> => "a.b"
 * Gives full IDE autocomplete for t('attendance.status.present') etc.
 */
type DeepKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? DeepKeys<T[K], `${Prefix}${K}.`>
    : `${Prefix}${K}`;
}[keyof T & string];

export type TranslationKey = DeepKeys<typeof th>;

/** Variables to interpolate: t('common.showing', { from: 1, to: 20, total: 100 }) */
export type InterpolationVars = Record<string, string | number>;

// ─── Locale state (module-level singleton) ────────────────────────────────────

const translations: Record<Locale, Record<string, unknown>> = { th, en };

let _locale: Locale = 'th';

const _listeners = new Set<() => void>();

export function getLocale(): Locale {
  return _locale;
}

export function setLocale(locale: Locale): void {
  if (_locale === locale) return;
  _locale = locale;
  _listeners.forEach((fn) => fn());
}

/** Subscribe to locale changes (used by the React hook). Returns unsubscribe fn. */
export function onLocaleChange(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

// ─── Core lookup ─────────────────────────────────────────────────────────────

/**
 * Traverse a dot-notation path through the translation object.
 * Returns the string value, or undefined if the path does not exist.
 */
function lookup(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Replace {{variable}} placeholders in a string.
 * t('common.showing', { from: 1, to: 20, total: 100 })
 * → "Showing 1-20 of 100 items"
 */
function interpolate(template: string, vars?: InterpolationVars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Translate a dot-notation key.
 *
 * Resolution order:
 *   1. Current locale (default: th)
 *   2. Fallback to 'en'
 *   3. Fallback to the raw key string (visible in UI so missing keys are obvious)
 *
 * @param key    - Dot-notation path, e.g. 'attendance.status.present'
 * @param vars   - Optional interpolation variables, e.g. { name: 'สมชาย' }
 * @param locale - Override locale for this call only
 */
export function t(
  key: TranslationKey,
  vars?: InterpolationVars,
  locale?: Locale
): string {
  const activeLocale = locale ?? _locale;
  const dict = translations[activeLocale] as Record<string, unknown>;
  const fallbackDict = translations['en'] as Record<string, unknown>;

  const value = lookup(dict, key) ?? lookup(fallbackDict, key);

  if (value === undefined) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.warn(`[i18n] Missing translation key: "${key}" (locale: ${activeLocale})`);
    }
    return interpolate(key, vars); // last resort: show the key so missing translations are obvious in UI
  }

  return interpolate(value, vars);
}

/**
 * Alias — import `translate` if you prefer a less ambiguous name in non-UI code.
 */
export const translate = t;

// ─── Re-exports ───────────────────────────────────────────────────────────────

export { th, en };
