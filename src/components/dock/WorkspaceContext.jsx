import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { workspace } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';

const WorkspaceContext = createContext(null);

/**
 * Holds the dock's data in one place, so the badges on the bar and the contents of a
 * panel never disagree — opening a panel does not refetch what the badge already knows.
 */
export function WorkspaceProvider({ children }) {
  const { isAuthenticated, canRead } = useAuth();
  const mayReadAnnouncements = canRead('announcements');

  const [todos, setTodos] = useState([]);
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
      const [todoList, reminderData, noteList] = await Promise.all([
        workspace.todos.list(),
        workspace.todos.reminders(),
        workspace.notes.list(),
      ]);
      setTodos(todoList);
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
  }, [isAuthenticated, mayReadAnnouncements]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(
    () => ({
      loading,
      todos,
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
        setTodos((current) => current.map((todo) => (todo._id === updated._id ? updated : todo)));
        await refreshReminders();
        return updated;
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
    [loading, todos, reminders, notes, announcements, announcementMeta, load, refreshReminders]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside a WorkspaceProvider');
  return context;
};
