import { useCallback, useEffect, useState } from 'react';
import DockIcon from './DockIcon.jsx';
import { useWorkspace } from './WorkspaceContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import TodoPanel from './TodoPanel.jsx';
import NotesPanel from './NotesPanel.jsx';
import AnnouncementsPanel from './AnnouncementsPanel.jsx';
import JarvisPanel from './JarvisPanel.jsx';

/**
 * The right-hand workspace: to-dos, notes, announcements and Jarvis, on every screen.
 *
 * These used to be a floating panel over the bottom-right corner, which made them something you
 * *consulted* — open it, read it, dismiss it to get your work back. A to-do list is not that. It
 * is the thing you keep beside what you are doing and tick off as you go, and a panel that
 * covers the page you are working on cannot be kept open.
 *
 * So it is a column rather than a popover: on a wide screen it takes its own space and the page
 * reflows to fit, which is what lets it stay open all day. Below that there is no room for two
 * columns, so it overlays with a scrim — the honest thing on a phone, where a 20rem panel beside
 * the content would leave neither usable.
 *
 * **Collapsed is still present.** The rail keeps its icons and their counts, so the answer to
 * "is anything waiting for me?" is on screen whether or not the panel is open. A collapsible
 * sidebar that hides the badge when collapsed only moves the problem.
 */

/** Remembered per browser, because whether this is open is a working preference, not state. */
const STORE_KEY = 'npt.workspace';

const readStored = () => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    /* A private window, cleared site data, storage blocked entirely — all fine. Defaults win. */
    return null;
  }
};

const store = (value) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(value));
  } catch {
    /* Not being able to remember the preference is not worth failing a render over. */
  }
};

export default function WorkspaceRail() {
  const { canRead, isAdmin } = useAuth();
  const { todos, notes, announcementMeta } = useWorkspace();

  const stored = readStored();
  const [open, setOpen] = useState(stored?.open ?? false);
  const [activeKey, setActiveKey] = useState(stored?.key || 'todos');

  const items = [
    {
      key: 'todos',
      label: 'To-do',
      short: 'To-do',
      icon: 'todo',
      badge: todos.filter((todo) => !todo.completed).length,
      Panel: TodoPanel,
    },
    ...(canRead('announcements')
      ? [
          {
            key: 'announcements',
            label: 'Announcements',
            short: 'News',
            icon: 'megaphone',
            badge: announcementMeta.unread,
            /* Unread plant-wide news is the one count here that is somebody else waiting. */
            urgent: announcementMeta.unread > 0,
            Panel: AnnouncementsPanel,
          },
        ]
      : []),
    {
      key: 'notes',
      label: 'Sticky notes',
      short: 'Notes',
      icon: 'note',
      badge: notes.length,
      Panel: NotesPanel,
    },
    /*
     * Administrators only, matching the route. Hidden rather than shown and refused: an
     * assistant that answers "you may not ask me that" to everything is worse than absent.
     */
    ...(isAdmin
      ? [{ key: 'jarvis', label: 'Ask Jarvis', short: 'Jarvis', icon: 'spark', Panel: JarvisPanel }]
      : []),
  ];

  const active = items.find((item) => item.key === activeKey) || items[0];

  const show = useCallback((key) => {
    setActiveKey(key);
    setOpen(true);
    store({ open: true, key });
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    store({ open: false, key: activeKey });
  }, [activeKey]);

  const toggle = (key) => (open && activeKey === key ? hide() : show(key));

  /*
   * Escape closes it only on a narrow screen, where it is an overlay covering the page. On a
   * wide one it is a column of the layout and Escape closing it would be as surprising as
   * Escape closing the left-hand navigation.
   */
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && window.matchMedia('(max-width: 1023px)').matches) hide();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, hide]);

  /** The count on the collapsed rail: everything actually waiting, in one number. */
  const waiting = items.reduce((sum, item) => sum + (item.badge || 0), 0);
  const anyUrgent = items.some((item) => item.urgent && item.badge > 0);

  return (
    <>
      {/* The scrim, and only where the panel overlays rather than pushes. */}
      {open && (
        <button
          type="button"
          aria-label="Close the workspace"
          onClick={hide}
          className="fixed inset-0 z-30 animate-fade-in bg-scrim/70 backdrop-blur-sm lg:hidden"
        />
      )}

      <div
        className={`z-40 flex shrink-0 ${
          open
            ? 'fixed inset-y-0 right-0 lg:static lg:inset-auto'
            : ''
        }`}
      >
        {open && (
          <section
            aria-label={active.label}
            className="flex w-[calc(100vw-4.25rem)] max-w-[21rem] flex-col border-l border-line/[0.06] bg-ink-850 sm:w-[21rem]"
          >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line/[0.06] px-4 py-2.5">
              <div className="flex items-center gap-2 text-steel-100">
                <DockIcon name={active.icon} className="h-4 w-4 text-flame-500" />
                <h2 className="text-[0.8125rem] font-bold tracking-tight">{active.label}</h2>
              </div>
              <button
                type="button"
                onClick={hide}
                aria-label="Collapse the workspace"
                title="Collapse"
                className="rounded p-1 text-steel-400 transition-colors hover:bg-line/[0.06] hover:text-steel-100"
              >
                <DockIcon name="close" className="h-3.5 w-3.5" />
              </button>
            </header>

            {/* `min-h-0` so the panel inside scrolls rather than pushing the column taller. */}
            <div className="min-h-0 flex-1">
              <active.Panel />
            </div>
          </section>
        )}

        {/*
          The rail itself, always there. Collapsed it is the only way back in; expanded it is
          how you move between panels without closing and reopening.
        */}
        <nav
          aria-label="Workspace"
          className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1 border-l border-line/[0.06] bg-ink-850 py-3"
        >
          {items.map((item) => {
            const current = open && active.key === item.key;
            return (
              <button
                key={item.key}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-expanded={current}
                onClick={() => toggle(item.key)}
                className={`relative flex w-[3.4rem] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.625rem] font-semibold transition-colors ${
                  current
                    ? 'bg-line/[0.08] text-flame-500'
                    : 'text-steel-400 hover:bg-line/[0.05] hover:text-steel-100'
                }`}
              >
                <DockIcon name={item.icon} className="h-[1.15rem] w-[1.15rem]" />
                {item.short}
                {item.badge > 0 && (
                  <span
                    className={`absolute right-1 top-1 min-w-[1rem] rounded-full px-1 text-[0.5625rem] font-bold leading-4 tabular-nums text-white ${
                      item.urgent ? 'bg-danger-500' : 'bg-steel-500'
                    }`}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/*
            One number for the whole rail, at the foot of it. On a tall screen the icons are at
            the top and the eye is not; this is the thing you catch out of the corner of it.
            Hidden while open, where the panel itself is the answer.
          */}
          {!open && waiting > 0 && (
            <button
              type="button"
              onClick={() => show(activeKey)}
              title={`${waiting} waiting`}
              className="mt-auto flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-steel-400 transition-colors hover:bg-line/[0.05] hover:text-steel-100"
            >
              <span
                className={`min-w-[1.4rem] rounded-full px-1.5 py-0.5 text-[0.6875rem] font-bold leading-4 tabular-nums text-white ${
                  anyUrgent ? 'bg-danger-500' : 'bg-flame-500'
                }`}
              >
                {waiting > 99 ? '99+' : waiting}
              </span>
              <span className="text-[0.5625rem] font-semibold">waiting</span>
            </button>
          )}
        </nav>
      </div>
    </>
  );
}
