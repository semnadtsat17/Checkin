/**
 * SettingCard.tsx
 *
 * White card container for a settings section.
 * Provides consistent title, spacing, and border radius across all sections.
 */
import type { ReactNode } from 'react';

interface SettingCardProps {
  title:       string;
  description?: string;
  children:    ReactNode;
}

export function SettingCard({ title, description, children }: SettingCardProps) {
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-gray-400">{description}</p>
        )}
      </div>
      <div className="px-6 py-5 space-y-5">
        {children}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A single row with a label + optional hint on the left and a control on the right. */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label:    string;
  hint?:    string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
