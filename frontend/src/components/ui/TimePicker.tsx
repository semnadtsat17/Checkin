import type { SlotState } from '../../modules/schedule/timeRangeEngine';

const MINUTES = [0, 15, 30, 45] as const;
const HOURS   = Array.from({ length: 24 }, (_, i) => i);

function pad(n: number) { return String(n).padStart(2, '0'); }

/** Tooltip text for each block reason — shown on disabled options. */
const SLOT_TOOLTIP: Record<NonNullable<SlotState['reason']>, string> = {
  OVERLAP_MAIN:  'ทับเวลางานหลัก',
  OVERLAP_EXTRA: 'ทับเวลางานเพิ่มเติม',
  INVALID_ORDER: 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม',
};

interface TimePickerProps {
  value:      string;            // HH:mm
  onChange:   (value: string) => void;
  className?: string;
  required?:  boolean;
  disabled?:  boolean;
  /**
   * When provided, the picker renders as a single flat <select>.
   * Each entry is a SlotState from `computeAllowedTimeRanges()`.
   * Disabled slots stay visible with opacity-50 and a reason tooltip.
   *
   * Pass an empty array `[]` to enable flat mode with no restrictions.
   */
  slots?: SlotState[];
}

/**
 * Custom time picker.
 *
 * Default mode (no `slots` prop): two-select layout (hour + minute).
 *
 * Flat mode (`slots` provided): single <select> driven by the engine's
 * SlotState array.  Disabled options are visible but non-selectable.
 * A belt-and-suspenders `onChange` guard rejects any blocked slot even if
 * keyboard navigation bypasses the HTML `disabled` attribute.
 */
export function TimePicker({
  value,
  onChange,
  className,
  required,
  disabled,
  slots,
}: TimePickerProps) {
  // ── Flat mode (engine-driven) ─────────────────────────────────────────────
  if (slots !== undefined) {
    // Build a lookup from slot value → disabled state for the change guard.
    const disabledSet = new Set(slots.filter((s) => s.disabled).map((s) => s.value));

    const selectCls = [
      'rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm',
      'outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
      'disabled:opacity-50',
      className ?? '',
    ].join(' ');

    function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
      const chosen = e.target.value;
      // Belt-and-suspenders: reject disabled slots even if keyboard bypassed HTML attr.
      if (disabledSet.has(chosen)) return;
      onChange(chosen);
    }

    return (
      <select
        value={value || ''}
        onChange={handleChange}
        disabled={disabled}
        required={required}
        className={selectCls}
      >
        {!value && <option value="">— เลือกเวลา —</option>}
        {slots.map(({ value: slotValue, disabled: slotDisabled, reason }) => (
          <option
            key={slotValue}
            value={slotValue}
            disabled={slotDisabled}
            title={slotDisabled && reason ? SLOT_TOOLTIP[reason] : undefined}
          >
            {slotValue}
          </option>
        ))}
      </select>
    );
  }

  // ── Two-select mode (default — no slots) ──────────────────────────────────
  const [rawH, rawM] = (value ?? '').split(':');
  const currentHour   = parseInt(rawH, 10);
  const currentMinute = parseInt(rawM, 10);
  const hour   = isNaN(currentHour)   ? 0 : currentHour;
  const minute = MINUTES.includes(currentMinute as typeof MINUTES[number]) ? currentMinute : 0;

  const selectCls = [
    'rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm',
    'outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500',
    'disabled:opacity-50',
    className ?? '',
  ].join(' ');

  return (
    <div className="inline-flex items-center gap-1">
      {/* Hour */}
      <select
        value={hour}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(`${pad(Number(e.target.value))}:${pad(minute)}`)}
        className={selectCls}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>{pad(h)}</option>
        ))}
      </select>

      <span className="select-none text-gray-400">:</span>

      {/* Minute — exactly 4 options */}
      <select
        value={minute}
        disabled={disabled}
        onChange={(e) => onChange(`${pad(hour)}:${pad(Number(e.target.value))}`)}
        className={selectCls}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>{pad(m)}</option>
        ))}
      </select>
    </div>
  );
}
