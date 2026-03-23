/**
 * Spinner — reusable animated loading indicator.
 *
 * Usage:
 *   <Spinner />                      — medium, primary colour
 *   <Spinner size="sm" />            — small
 *   <Spinner size="lg" color="gray" />
 *
 * PageSpinner — full-page centred variant for initial data loads.
 */

interface SpinnerProps {
  size?:  'sm' | 'md' | 'lg';
  color?: 'primary' | 'white' | 'gray';
  className?: string;
}

const SIZE_CLS  = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' };
const COLOR_CLS = {
  primary: 'text-primary-600',
  white:   'text-white',
  gray:    'text-gray-400',
};

export function Spinner({ size = 'md', color = 'primary', className = '' }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin ${SIZE_CLS[size]} ${COLOR_CLS[color]} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 3 10.373 3 12h1z"
      />
    </svg>
  );
}

/** Full-page centred spinner for initial data loads. */
export function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner size="lg" color="gray" />
    </div>
  );
}
