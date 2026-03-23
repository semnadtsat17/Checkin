import { useEffect, useState } from 'react';

/**
 * useCurrentYear — returns the current calendar year and updates automatically
 * if the year changes (checked every 60 seconds). No page reload required.
 */
export function useCurrentYear(): number {
  const [year, setYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    const id = setInterval(() => {
      const current = new Date().getFullYear();
      setYear((prev) => (prev !== current ? current : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return year;
}
