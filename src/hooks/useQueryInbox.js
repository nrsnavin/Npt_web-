import { useCallback, useEffect, useRef, useState } from 'react';
import { queries as queriesApi } from '../api/endpoints.js';
import { INBOX_CHANGED } from '../components/InboxBell.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { selfId } from '../utils/pipeline.js';
import { scopedKey } from '../auth/accounts.js';

/**
 * The Queries panel's live count, and the alert when something new arrives [server:
 * query.controller `queryUnread`].
 *
 * Asked every 30 seconds, when the tab comes back into view, and whenever a screen says the inbox
 * changed (a thread read, a reply sent). When the newest unread moment moves past the one last
 * seen, the person is told: a toast in the app, and — if they allowed it — a desktop notification,
 * which is what reaches them while the app sits in a background tab. The tab's title carries the
 * count too, so it shows on the browser's tab strip.
 *
 * "Last seen" is kept per browser, so coming back after lunch to three new questions says so once.
 */
const SEEN_KEY = 'npt.queries.seen';
const POLL_MS = 30000;

/* null when this browser has never looked — its first look sets the mark quietly, rather than
   announcing a backlog the badge already shows. */
const readSeen = () => {
  try {
    const raw = localStorage.getItem(scopedKey(SEEN_KEY));
    return raw === null ? null : Number(raw) || 0;
  } catch { return null; }
};
const writeSeen = (value) => {
  try { localStorage.setItem(scopedKey(SEEN_KEY), String(value)); } catch { /* a private window — fine */ }
};
const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

export default function useQueryInbox({ enabled = true, onOpen } = {}) {
  const [data, setData] = useState(null);
  const [permission, setPermission] = useState(() => (canNotify() ? window.Notification.permission : 'unsupported'));
  const { toast } = useToast();
  const me = selfId(useAuth().user);
  const seen = useRef(readSeen());
  const baseTitle = useRef(typeof document !== 'undefined' ? document.title.replace(/^\(\d+\+?\)\s*/, '') : '');
  const opener = useRef(onOpen);
  opener.current = onOpen;

  const announce = useCallback((answer) => {
    const fresh = (answer.rows || []).filter((row) => row.unread > 0 && row.counts && row.last?.at && new Date(row.last.at).getTime() > seen.current);
    if (!fresh.length) return;
    const first = fresh[0];
    /* The last line may be the reader's own, with others' unread above it: never quote them to themselves. */
    const mine = String(first.last?.by?._id || first.last?.by || '') === me;
    const title = fresh.length > 1
      ? `${fresh.length} queries have something new`
      : mine
        ? `${first.unread} unread · ${first.number}`
        : `${first.last?.kind === 'question' ? 'New query' : 'New reply'} · ${first.number}`;
    const body = fresh.length > 1
      ? fresh.slice(0, 3).map((row) => `${row.number} — ${row.subject}`).join('\n')
      : mine
        ? first.subject
        : `${first.last?.by?.name ? `${first.last.by.name}: ` : ''}${first.last?.text || first.subject}`;
    toast(title, body);
    if (canNotify() && window.Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try {
        const note = new window.Notification(title, { body, tag: 'npt-queries', renotify: true });
        note.onclick = () => { window.focus(); opener.current?.(fresh.length === 1 ? first._id : null); note.close(); };
      } catch { /* some browsers only notify from a service worker — the toast still went */ }
    }
  }, [toast, me]);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const answer = await queriesApi.unread();
      setData(answer);
      if (seen.current === null) {
        seen.current = answer.latestAt || 0;
        writeSeen(seen.current);
      } else if (answer.latestAt && answer.latestAt > seen.current) {
        announce(answer);
        seen.current = answer.latestAt;
        writeSeen(answer.latestAt);
      }
    } catch { /* offline for a moment — the next tick tries again */ }
  }, [enabled, announce]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(INBOX_CHANGED, load);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(INBOX_CHANGED, load);
    };
  }, [enabled, load]);

  /* The count on the browser tab: "(3) Navin Hangers". */
  useEffect(() => {
    const count = data?.unread || 0;
    document.title = count ? `(${count > 99 ? '99+' : count}) ${baseTitle.current}` : baseTitle.current;
  }, [data?.unread]);

  const askPermission = useCallback(async () => {
    if (!canNotify()) return;
    setPermission(await window.Notification.requestPermission());
  }, []);

  return { data, reload: load, permission, askPermission };
}
