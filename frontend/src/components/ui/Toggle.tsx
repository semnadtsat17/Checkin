/**
 * Toggle.tsx
 *
 * Reusable accessible toggle switch.
 * Matches the visual pattern used in DashboardPage's super-admin panel.
 */

interface ToggleProps {
  checked:   boolean;
  onChange:  (checked: boolean) => void;
  disabled?: boolean;
  label?:    string;   // screen-reader label
}

export function Toggle({ checked, onChange, disabled = false, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? 'bg-primary-600' : 'bg-gray-200'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200
          ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}
