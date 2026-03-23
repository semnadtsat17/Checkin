import { useCallback, useEffect, useState } from 'react';
import {
  t,
  getLocale,
  setLocale,
  onLocaleChange,
  type Locale,
  type TranslationKey,
  type InterpolationVars,
} from '@hospital-hr/shared';

/**
 * React hook for translations.
 *
 * - Reads persisted locale from localStorage on first mount (Thai default).
 * - Syncs the shared module singleton + document.lang via useEffect (not in
 *   the state initializer, which would be a render side-effect).
 * - Triggers re-render when locale changes via shared onLocaleChange listener.
 *
 * Usage:
 *   const { t, locale, changeLocale } = useTranslation();
 *   <button>{t('common.save')}</button>
 *   <span>{t('dashboard.checkedIn', { time: '08:30' })}</span>
 */
export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = localStorage.getItem('locale') as Locale | null;
    return stored === 'en' ? 'en' : 'th';
  });

  // Sync shared singleton + document.lang on mount (and whenever locale changes)
  useEffect(() => {
    setLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  // Subscribe to locale changes from ANY component that calls changeLocale
  useEffect(() => {
    const unsub = onLocaleChange(() => {
      const next = getLocale();
      setLocaleState(next);
      document.documentElement.lang = next;
    });
    return unsub;
  }, []);

  const changeLocale = useCallback((next: Locale) => {
    localStorage.setItem('locale', next);
    setLocale(next); // fires onLocaleChange → setLocaleState → re-render
  }, []);

  const translate = useCallback(
    (key: TranslationKey, vars?: InterpolationVars) => t(key, vars),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale], // re-memoize when locale changes
  );

  return { t: translate, locale, changeLocale };
}
