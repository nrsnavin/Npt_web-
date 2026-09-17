import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { workspace } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { selfId } from '../../utils/pipeline.js';

const WorkspaceContext = createContext(null);

/**
 * Holds the dock's data in one place, so the badges on the bar and the contents of a
 * panel never disagree — opening a panel does not refetch what the badge already knows.
 */
export function WorkspaceProvider({ children }) {
  const { isAuthenticated, canRead, user } = useAuth();
  const mayReadAnnouncements = canRead('announcements');
  const me = selfId(user);

  const [todos, setTodos] = useState([]);
  /**
   * Which question the list is currently answering [§35].
   *
   * `mine` is what I am holding — and it is the default deliberately, because the dock is the
   * list somebody works from and a queue they share with four colleagues is not that. The other
   * two are asked for: `department`, the queue proper, and `customers`, marketing's view across
   * every department's work on the buyers they own.
   */
  const [scope, setScope] = useState('mine');
  const [todoMeta, setTodoMeta] = useState({ scope: 'mine', department: null, mayReadCustomers: false });
  const [reminders, setReminders] = useState(null);
  const [notes, setNotes] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementMeta, setAnnouncementMeta] = useState({ unread: 0, canPublish: false });
  const [loading, setLoading] = useState(true);

  const refreshReminders = useCallback(async () => {
    setReminders(await workspace.todos.reminders());
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [todoResponse, reminderData, noteList] = await Promise.all([
        workspace.todos.list({ scope }),
        workspace.todos.reminders(),
        workspace.notes.list(),
      ]);
      setTodos(todoResponse.data);
      setTodoMeta(todoResponse.meta || {});
      setReminders(reminderData);
      setNotes(noteList);

      if (mayReadAnnouncements) {
        const response = await workspace.announcements.list();
        setAnnouncements(response.data);
        setAnnouncementMeta(response.meta);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, mayReadAnnouncements, scope]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(
    () => ({
      loading,
      todos,
      todoMeta,
      scope,
      setScope,
      reminders,
      notes,
      announcements,
      announcementMeta,
      reload: load,

      async addTodo(payload) {
        const created = await workspace.todos.create(payload);
        setTodos((current) => [created, ...current]);
        await refreshReminders();
        return created;
      },
      async saveTodo(payload) {
        const updated = await workspace.todos.update(payload);
        /*
         * Handing a job back to the department removes it from the `mine` list rather than
         * leaving a row that claims to be yours — the reply says who holds it now, so the list
         * follows rather than waiting for a refresh somebody has to know to do.
         */
        const stillHere =
          scope !== 'mine' || String(updated.user?._id || updated.user || '') === me;
        setTodos((current) =>
          stillHere
            ? current.map((todo) => (todo._id === updated._id ? updated : todo))
            : current.filter((todo) => todo._id !== updated._id)
        );
        await refreshReminders();
        return updated;
      },
      /**
       * Handing a task to another department [§25].
       *
       * It leaves this department's queue, so on the queue view the row goes. On `mine` it
       * stays: the person who escalated keeps watching whether anybody picked it up, which is
       * the difference between a handover and a disposal.
       */
      async escalateTodo(payload) {
        const moved = await workspace.todos.escalate(payload);
        setTodos((current) =>
          scope === 'department'
            ? current.filter((todo) => todo._id !== moved._id)
            : current.map((todo) => (todo._id === moved._id ? moved : todo))
        );
        await refreshReminders();
        return moved;
      },
      async removeTodo(id) {
        await workspace.todos.remove(id);
        setTodos((current) => current.filter((todo) => todo._id !== id));
        await refreshReminders();
      },

      async addNote(payload) {
        const created = await workspace.notes.create(payload);
        setNotes((current) => [created, ...current]);
        return created;
      },
      async saveNote(payload) {
        const updated = await workspace.notes.update(payload);
        setNotes((current) =>
          [...current.map((note) => (note._id === updated._id ? updated : note))].sort(
            (a, b) => Number(b.pinned) - Number(a.pinned)
          )
        );
        return updated;
      },
      async removeNote(id) {
        await workspace.notes.remove(id);
        setNotes((current) => current.filter((note) => note._id !== id));
      },

      async addAnnouncement(payload) {
        const created = await workspace.announcements.create(payload);
        setAnnouncements((current) => [created, ...current]);
        return created;
      },
      async markAnnouncementRead(id) {
        const updated = await workspace.announcements.markRead(id);
        setAnnouncements((current) =>
          current.map((item) => (item.id === updated.id ? updated : item))
        );
        setAnnouncementMeta((current) => ({
          ...current,
          unread: Math.max(current.unread - 1, 0),
        }));
        return updated;
      },
      async removeAnnouncement(id) {
        await workspace.announcements.remove(id);
        setAnnouncements((current) => current.filter((item) => item.id !== id));
      },
    }),
    [
      loading, todos, todoMeta, scope, me, reminders, notes, announcements, announcementMeta,
      load, refreshReminders,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside a WorkspaceProvider');
  return context;
};
