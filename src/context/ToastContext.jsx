import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Telling somebody their action worked.
 *
 * Every successful write in this application was silent. A dialog closed, a list refreshed, and
 * the person was left to infer from the absence of an error that the thing had happened — which
 * works on a fast connection with a screen you are already looking at, and fails everywhere
 * else. On a plant floor, on a phone, on a tab somebody switched away from mid-save, "nothing
 * visibly changed" and "it did not save" look identical.
 *
 * Failures were never silent; they have always had a red notice inside the form. So the gap was
 * exactly one-sided, and the asymmetry is what made it hard to notice while building: the
 * developer testing a save watches the row update. The supervisor who tapped a badge on a phone
 * in a noisy bay does not, and taps it again.
 *
 * Four rules, and they are the whole design:
 *
 * **It says what happened, not that something happened.** "Recorded — NPT-400S is running" beats
 * "Saved". The first confirms the reader's intent back to them, which is the only way a
 * confirmation can catch a mistake; the second is a noise that means "no error".
 *
 * **It never blocks.** No modal, no button to dismiss before continuing. Somebody moving twenty
 * consignments should see twenty confirmations go past and never once be interrupted.
 *
 * **It is announced, not only drawn.** `role="status"` with a polite live region, because a
 * confirmation only a sighted user gets is a confirmation half the point of.
 *
 * **It leaves on its own.** Four seconds is long enough to read one line and short enough not to
 * stack up during a busy morning. Errors stay longer, because they are read more carefully and
 * more often re-read.
 */

const ToastContext = createContext(null);

const LIFE = { success: 4000, info: 5000, danger: 8000 };

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  /* Kept in a ref so a dismiss that fires after unmount cannot set state on a dead tree. */
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, { tone = 'success', detail } = {}) => {
      if (!message) return null;

      const id = ++nextId;
      /* Three at a time. A stack taller than that stops being read and starts being scenery,
         and the oldest is always the least relevant. */
      setToasts((current) => [...current.slice(-2), { id, message, detail, tone }]);
      timers.current.set(id, setTimeout(() => dismiss(id), LIFE[tone] ?? LIFE.success));
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      /** The ordinary case: something worked. */
      toast: (message, detail) => push(message, { tone: 'success', detail }),
      /** Something happened that is worth reading but is not a success. */
      note: (message, detail) => push(message, { tone: 'info', detail }),
      /**
       * A failure worth surfacing *outside* a form — a background save, or an action taken from
       * a row where there is nowhere to put a red notice. Inside a form the notice stays: it
       * belongs beside the field that caused it.
       */
      warn: (message, detail) => push(message, { tone: 'danger', detail }),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const TONE = {
  success: 'border-success-500/40 bg-ink-800 text-steel-100',
  info: 'border-line/[0.12] bg-ink-800 text-steel-100',
  danger: 'border-danger-500/50 bg-ink-800 text-steel-100',
};

const MARK = { success: '✓', info: '·', danger: '!' };

const MARK_TONE = {
  success: 'bg-success-500/15 text-success-400',
  info: 'bg-line/[0.08] text-steel-300',
  danger: 'bg-danger-500/15 text-danger-400',
};

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return createPortal(
    <div
      /* `pointer-events-none` on the stack and `auto` on each toast, so the empty space beside
         a confirmation never swallows a click meant for the screen underneath.

         The right padding clears the workspace rail (`w-[4.25rem]`, always on screen). A
         confirmation sitting on top of the to-do icons hides a count somebody is watching, and
         covers the button they were about to press next. */
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pr-[5.25rem] sm:items-end sm:p-6 sm:pr-[5.75rem]"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full max-w-sm animate-scale-in items-start gap-3 rounded-xl border px-4 py-3 shadow-modal ${TONE[toast.tone]}`}
        >
          <span
            aria-hidden
            className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold ${MARK_TONE[toast.tone]}`}
          >
            {MARK[toast.tone]}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{toast.message}</p>
            {toast.detail && <p className="mt-0.5 text-xs text-steel-400">{toast.detail}</p>}
          </div>

          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="-mr-1 -mt-1 flex-none rounded-md px-1.5 py-0.5 text-steel-500 transition-colors hover:text-steel-200"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

/**
 * Never throws when there is no provider.
 *
 * A component rendered in a test, or in a corner of the tree mounted before the provider, should
 * lose its confirmation rather than fail to render. A missing toast is a small loss; a screen
 * that will not draw because of one is not.
 */
export function useToast() {
  return (
    useContext(ToastContext) || {
      toast: () => null,
      note: () => null,
      warn: () => null,
      dismiss: () => null,
    }
  );
}
