import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspace as workspaceApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { announceInboxChanged } from './InboxBell.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { enablePush, pushState } from '../utils/push.js';

/**
 * A new task reaches the person the moment it is raised, three ways at once:
 *
 *  - the push to the device [public/sw.js], which the service worker also hands to the open app,
 *    so the toast here shows as the notification lands, with no polling;
 *  - this poll, every twenty seconds while the tab is in view, for a device that never allowed
 *    notifications or a browser that cannot take them [server: workspace.controller `freshTodos`];
 *  - and the bell, which is told to look again either way.
 *
 * Plus the offer: a device that could take notifications and has not been asked is asked once,
 * in a line under the bar, so the push is on before the first task comes rather than after.
 */
const POLL_MS = 20 * 1000;
const OFFER_KEY = 'npt:push-offer';

export default function LiveAlerts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { undoable } = useToast();
  const since = useRef(new Date().toISOString());
  const seen = useRef(new Set());
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);

  const show = (title, detail, link) => {
    undoable(title, { detail, label: 'Open', onAction: () => navigate(link || '/departments/mine') });
    announceInboxChanged();
  };

  /* The push, handed over by the service worker while the app is open. */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type !== 'push') return;
      const message = event.data.message || {};
      if (message.taskId) seen.current.add(String(message.taskId));
      show(message.title || 'Navin Hangers', message.body || '', message.link);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The poll, for the rest. */
  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const reply = await workspaceApi.todos.fresh(since.current);
        if (!live) return;
        since.current = reply?.meta?.asOf || new Date().toISOString();
        const rows = reply?.data || [];
        for (const row of rows) {
          const id = String(row._id);
          if (seen.current.has(id)) continue;
          seen.current.add(id);
          show(
            `New task for ${departmentLabel(row.department)}`,
            `${row.title}${row.createdBy?.name ? ` · raised by ${row.createdBy.name}` : ''}${row.priority === 'high' ? ' · high priority' : ''}`,
            row.link,
          );
        }
      } catch {
        /* Offline or signed out: the next tick tries again. */
      }
    };
    const timer = setInterval(poll, POLL_MS);
    const back = () => document.visibilityState === 'visible' && poll();
    document.addEventListener('visibilitychange', back);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* The offer, once per device. */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(OFFER_KEY) === 'no') return;
    } catch {
      return;
    }
    pushState().then((state) => setOffer(state === 'off')).catch(() => setOffer(false));
  }, []);

  const decline = () => {
    setOffer(false);
    try { window.localStorage.setItem(OFFER_KEY, 'no'); } catch { /* a private window */ }
  };
  const accept = async () => {
    setBusy(true);
    try {
      await enablePush();
      setOffer(false);
      undoable('Notifications are on for this device', { detail: 'You will be told the moment a task is raised for your team.', label: 'Settings', onAction: () => navigate('/profile') });
    } catch (failure) {
      undoable('Notifications were not turned on', { detail: failure.message, label: 'Settings', onAction: () => navigate('/profile') });
    } finally {
      setBusy(false);
    }
  };

  if (!offer) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/20 bg-accent/[0.06] px-4 py-2 text-sm" role="region" aria-label="Turn on notifications">
      <p className="text-steel-200">
        <span className="font-semibold text-steel-50">Get told the moment a task is raised for your team</span> — on this device, even with the app closed.
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={busy} onClick={accept}>{busy ? 'Turning on…' : 'Turn on'}</button>
        <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={decline}>Not now</button>
      </div>
    </div>
  );
}
