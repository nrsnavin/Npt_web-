import { useEffect } from 'react';
import { statusClass, toneClass } from '../utils/statusStyles.js';
import { humanise } from '../utils/format.js';

export function Badge({ status, tone, children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[0.6875rem]
        font-bold uppercase tracking-wide ring-1 ring-inset ${
          tone ? toneClass(tone) : statusClass(status)
        }`}
    >
      {children ?? humanise(status)}
    </span>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-steel-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-flame-500" />
      {label}…
    </div>
  );
}

/** Placeholder rows that hold the table's shape while the first page loads. */
export function TableSkeleton({ rows = 5, columns = 5 }) {
  return (
    <div className="card overflow-hidden">
      <div className="h-11 border-b border-white/[0.06] bg-ink-800/70" />
      <div className="divide-y divide-white/[0.04]">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <div
                key={columnIndex}
                className="skeleton h-3.5"
                style={{ width: columnIndex === 0 ? '22%' : `${12 + ((columnIndex * 7) % 14)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="card animate-fade-up p-10 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-danger-500/15 text-lg text-danger-400 ring-1 ring-inset ring-danger-500/25">
        !
      </div>
      <p className="text-base font-bold tracking-tight text-steel-50">
        {error?.message || 'Something went wrong'}
      </p>
      {error?.details?.length ? (
        <ul className="mt-3 space-y-1 text-sm text-steel-400">
          {error.details.map((detail) => (
            <li key={detail.field}>
              <span className="text-steel-300">{detail.field}</span>: {detail.message}
            </li>
          ))}
        </ul>
      ) : null}
      {onRetry && (
        <button type="button" className="btn-secondary mt-5" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action, icon = '◇' }) {
  return (
    <div className="card animate-fade-up flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] text-xl text-steel-500 ring-1 ring-inset ring-white/[0.06]">
        {icon}
      </div>
      <p className="text-base font-bold tracking-tight text-steel-50">{title}</p>
      {description && <p className="max-w-sm text-sm leading-relaxed text-steel-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[1.6rem] font-extrabold tracking-tighter text-steel-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-steel-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Labelled form control. The control is nested inside the label element so it is
 * implicitly associated with it — clicking the text focuses the input, and screen
 * readers announce the two together without needing matching id attributes.
 */
export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-steel-500">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-danger-400">{error.message || String(error)}</p>
      )}
    </label>
  );
}

export function Modal({ open, title, description, onClose, children, size = 'md' }) {
  // Escape closes, and the page behind must not scroll while a dialog is up.
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }[size];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="fixed inset-0 animate-fade-in cursor-default bg-ink-950/80 backdrop-blur-sm"
      />

      <div className="relative flex min-h-full items-start justify-center p-4 sm:p-8">
        <div
          role="dialog"
          aria-modal="true"
          className={`card animate-scale-in my-auto w-full ${width} !bg-ink-850 shadow-modal`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-steel-50">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-steel-400">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 rounded-lg p-1.5 text-steel-400 transition-colors hover:bg-white/[0.06] hover:text-steel-100"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Confirm dialog used before destructive or irreversible actions. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onClose, busy }) {
  return (
    <Modal open={open} title={title} onClose={onClose} size="sm">
      <p className="text-sm leading-relaxed text-steel-300">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Inline success/error feedback inside forms and action dialogs. */
export function Notice({ tone = 'danger', children }) {
  const tones = {
    danger: 'bg-danger-500/10 text-danger-400 ring-danger-500/20',
    success: 'bg-success-500/10 text-success-400 ring-success-500/20',
    warn: 'bg-warn-500/10 text-warn-400 ring-warn-500/20',
    info: 'bg-aqua-500/10 text-aqua-300 ring-aqua-500/20',
  };

  return (
    <div className={`rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset ${tones[tone]}`}>{children}</div>
  );
}
