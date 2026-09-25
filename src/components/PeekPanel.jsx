import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

/**
 * A record opened beside its list rather than instead of it — the list stays where it was, with
 * the same scroll and the same ticks, so working through ten threads is ten clicks and not ten
 * trips back. Escape or the × closes it; "Open full page" is there for when it needs the room.
 */
export default function PeekPanel({ open, onClose, fullHref, title = 'Preview', children }) {
  useEffect(() => {
    if (!open) return undefined;
    const escape = (event) => {
      /* A menu or dialog inside the panel closes first. */
      if (event.key === 'Escape' && !document.querySelector('[role=dialog] [role=dialog], [role=dialog][aria-modal=true]')) onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" aria-label={title}>
      <button
        type="button"
        aria-label="Close the preview"
        className="absolute inset-0 animate-fade-in cursor-default bg-scrim/40"
        onClick={onClose}
      />
      <aside
        role="complementary"
        aria-label={title}
        className="relative flex h-full w-full max-w-3xl animate-slide-in-right flex-col border-l border-line/[0.08] bg-ink-900 shadow-modal"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line/[0.06] px-5 py-3">
          <Link to={fullHref} className="text-sm font-semibold text-accent hover:underline">
            Open full page ↗
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-lg leading-none text-steel-400 hover:bg-line/[0.06] hover:text-steel-100"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>,
    document.body
  );
}
