import { useEffect, useRef, useState } from 'react';
import DockIcon from './DockIcon.jsx';
import { useWorkspace } from './WorkspaceContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import TodoPanel from './TodoPanel.jsx';
import NotesPanel from './NotesPanel.jsx';
import AnnouncementsPanel from './AnnouncementsPanel.jsx';
import JarvisPanel from './JarvisPanel.jsx';

/**
 * The bottom-right utility dock: tasks, notes, announcements and the daily reminder.
 * One panel is open at a time — these are glanceable tools, not windows to arrange.
 */
export default function Dock() {
  const { canRead, isAdmin } = useAuth();
  const { todos, notes, announcementMeta } = useWorkspace();
  const [openKey, setOpenKey] = useState(null);
  const dockRef = useRef(null);

  /*
   * Reminders deliberately live on the dashboard, not here. A dock panel is for glancing
   * at something while you work on something else; "what needs me today" is the thing you
   * open the app to see, so it belongs on the screen that opens.
   */
  const items = [
    /*
     * First in the dock, because it is the one that answers a question rather than holding a
     * list — and the question is usually why somebody opened the app.
     *
     * Administrators only, matching the route. Hidden rather than shown and refused: an
     * assistant that answers "you may not ask me that" to every question is worse than one
     * that is not there, and it answers across every module at once, which is a management
     * view of the plant rather than anybody's own screen.
     */
    ...(isAdmin
      ? [{ key: 'jarvis', label: 'Ask Jarvis', icon: 'spark', Panel: JarvisPanel }]
      : []),
    {
      key: 'todos',
      label: 'To-do',
      icon: 'todo',
      badge: todos.filter((todo) => !todo.completed).length,
      Panel: TodoPanel,
    },
    {
      key: 'notes',
      label: 'Sticky notes',
      icon: 'note',
      badge: notes.length,
      Panel: NotesPanel,
    },
    ...(canRead('announcements')
      ? [
          {
            key: 'announcements',
            label: 'Announcements',
            icon: 'megaphone',
            badge: announcementMeta.unread,
            urgent: announcementMeta.unread > 0,
            Panel: AnnouncementsPanel,
          },
        ]
      : []),
  ];

  const active = items.find((item) => item.key === openKey);

  // Escape closes, and a click outside dismisses — a dock panel should never trap you.
  useEffect(() => {
    if (!openKey) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpenKey(null);
    };
    const onPointerDown = (event) => {
      if (dockRef.current && !dockRef.current.contains(event.target)) setOpenKey(null);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openKey]);

  return (
    <div ref={dockRef} className="flex items-center gap-0.5">
      {active && (
        <div
          role="dialog"
          aria-label={active.label}
          className="card animate-scale-in fixed bottom-12 right-3 z-40 flex h-[27rem] w-[21rem] flex-col overflow-hidden !bg-ink-850 shadow-modal sm:right-4"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line/[0.06] px-4 py-2.5">
            <div className="flex items-center gap-2 text-steel-100">
              <DockIcon name={active.icon} className="h-4 w-4 text-flame-500" />
              <h2 className="text-[0.8125rem] font-bold tracking-tight">{active.label}</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpenKey(null)}
              aria-label={`Close ${active.label}`}
              className="rounded p-1 text-steel-400 transition-colors hover:bg-line/[0.06] hover:text-steel-100"
            >
              <DockIcon name="close" className="h-3.5 w-3.5" />
            </button>
          </header>

          <div className="min-h-0 flex-1">
            <active.Panel />
          </div>
        </div>
      )}

      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-expanded={openKey === item.key}
          onClick={() => setOpenKey(openKey === item.key ? null : item.key)}
          className={`relative rounded-md px-2 py-1.5 transition-colors ${
            openKey === item.key
              ? 'bg-line/[0.08] text-flame-500'
              : 'text-steel-400 hover:bg-line/[0.05] hover:text-steel-100'
          }`}
        >
          <DockIcon name={item.icon} className="h-4 w-4" />
          {item.badge > 0 && (
            <span
              className={`absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full px-1 text-[0.5625rem] font-bold leading-4 tabular-nums text-white ${
                item.urgent ? 'bg-danger-500' : 'bg-steel-500'
              }`}
            >
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
