import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { inbox as inboxApi, workspace } from '../api/endpoints.js';
import { formatDate } from '../utils/format.js';

/**
 * The bell: everything waiting on me — tags, urgent threads, signatures, answered samples,
 * overdue tasks — in one list with the thing to do beside each.
 *
 * Nothing here is "marked read". Every item is a record's own state, so it leaves when the work
 * is done: open the thread and the tag goes, decide the price and the signature goes. Checked
 * every minute and whenever the tab comes back into view.
 */
const KIND = {
  tag: { mark: '@', tone: 'bg-aqua-500/15 text-aqua-300', action: 'Open' },
  urgent: { mark: '!', tone: 'bg-danger-500/15 text-danger-400', action: 'Open' },
  approval: { mark: '₹', tone: 'bg-warn-500/15 text-warn-400', action: 'Review' },
  sample: { mark: '◎', tone: 'bg-success-500/15 text-success-400', action: 'Open' },
  task: { mark: '✓', tone: 'bg-line/[0.08] text-steel-300', action: 'Open' },
};

/** Said by a screen whose work may have cleared something in the bell — reading a thread. */
export const INBOX_CHANGED = 'npt:inbox-changed';
export const announceInboxChanged = () => window.dispatchEvent(new Event(INBOX_CHANGED));

export default function InboxBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const location = useLocation();

  const load = useCallback(() => {
    inboxApi.get().then((answer) => setItems(answer?.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    const back = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', back);
    window.addEventListener(INBOX_CHANGED, load);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener(INBOX_CHANGED, load);
    };
  }, [load]);

  /* Moving to another screen is often the work itself — reading a thread — so look again. */
  useEffect(() => {
    setOpen(false);
    load();
  }, [location.pathname, load]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => box.current && !box.current.contains(event.target) && setOpen(false);
    const escape = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const finish = async (item) => {
    await workspace.todos.update({ id: item.taskId, completed: true }).catch(() => {});
    load();
  };

  const count = items.length;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-label={count ? `Notifications: ${count} waiting` : 'Notifications'}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-steel-300 transition-colors hover:bg-line/[0.06] hover:text-steel-50"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-flame-500 px-1 text-[0.65rem] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] animate-scale-in overflow-hidden rounded-xl border border-line/[0.1] bg-ink-800 shadow-modal"
        >
          <header className="flex items-center justify-between border-b border-line/[0.06] px-4 py-3">
            <p className="text-sm font-bold text-steel-50">Waiting on you</p>
            <span className="text-xs text-steel-500">{count ? `${count} thing${count === 1 ? '' : 's'}` : 'All clear'}</span>
          </header>
          {count ? (
            <ul className="max-h-[70vh] divide-y divide-line/[0.05] overflow-y-auto">
              {items.map((item) => {
                const kind = KIND[item.kind] || KIND.task;
                return (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <span aria-hidden className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${kind.tone}`}>
                      {kind.mark}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-steel-100">{item.title}</p>
                      {item.detail && <p className="mt-0.5 line-clamp-2 text-xs text-steel-400">{item.detail}</p>}
                      <p className="mt-0.5 text-[0.7rem] text-steel-500">{formatDate(item.at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Link to={item.link} onClick={() => setOpen(false)} className="text-xs font-bold text-accent hover:underline">
                        {kind.action}
                      </Link>
                      {item.kind === 'task' && (
                        <button type="button" onClick={() => finish(item)} className="text-xs font-semibold text-steel-400 hover:text-success-400">
                          Done
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-steel-500">Nothing is waiting on you. Nice.</p>
          )}
        </div>
      )}
    </div>
  );
}
