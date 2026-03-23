import React from 'react';

interface Props {
  open:     boolean;
  onClose:  () => void;
  title:    string;
  children: React.ReactNode;
  wide?:    boolean;  // wider modal for complex forms
}

export function Modal({ open, onClose, title, children, wide }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-xl
                       ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
