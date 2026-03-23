/**
 * Round a HH:mm string to the nearest 15-minute boundary (00 / 15 / 30 / 45).
 * The cut-off is at 7.5 minutes past each quarter (Math.round rounds ≥ 7.5 up).
 *
 * 10:02 → 10:00   ( 2 min from :00  → round down)
 * 10:08 → 10:15   ( 8 min from :00  → round up  )
 * 10:22 → 10:15   ( 7 min from :15  → round down)
 * 10:38 → 10:45   ( 8 min from :30  → round up  )
 * 10:53 → 11:00   ( 8 min from :45  → round up, wraps to next hour)
 * 23:53 → 00:00   (wraps midnight)
 */
export function roundToQuarterHour(time: string): string {
  if (!time) return time;
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time;

  const totalMinutes = h * 60 + m;
  const rounded = Math.round(totalMinutes / 15) * 15;
  const rh = Math.floor(rounded / 60) % 24;
  const rm = rounded % 60;
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

/** Returns true if the HH:mm string falls exactly on a 15-minute boundary. */
export function isQuarterHour(time: string): boolean {
  if (!time) return false;
  const m = parseInt(time.split(':')[1], 10);
  return m === 0 || m === 15 || m === 30 || m === 45;
}

/**
 * DOM-level safety net — patches every existing and future time input on the page.
 *
 * In a React app the TimePicker component is the primary enforcement mechanism.
 * This function acts as a belt-and-suspenders guard for any inputs that might
 * be injected by third-party widgets or future code that bypasses the component.
 *
 * Call once at app startup (main.tsx).
 */
export function enforceQuarterHourInputs(): void {
  function patchInput(input: HTMLInputElement) {
    if (input.dataset.quarterHourEnforced) return;
    input.dataset.quarterHourEnforced = '1';
    input.step = '900'; // 900 seconds = 15 minutes

    function correct() {
      if (!input.value) return;
      const rounded = roundToQuarterHour(input.value);
      if (rounded !== input.value) input.value = rounded;
    }

    input.addEventListener('change', correct);
    input.addEventListener('blur',   correct);
    correct(); // fix any pre-existing invalid value immediately
  }

  // Patch all currently present inputs
  document.querySelectorAll<HTMLInputElement>('input[type="time"], input[type="datetime-local"]')
    .forEach(patchInput);

  // Watch for inputs added later (dynamic routes / modals)
  const observer = new MutationObserver((mutations) => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLInputElement &&
            (node.type === 'time' || node.type === 'datetime-local')) {
          patchInput(node);
        }
        node.querySelectorAll<HTMLInputElement>('input[type="time"], input[type="datetime-local"]')
          .forEach(patchInput);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
