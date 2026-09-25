import { useState } from 'react';
import { queries as queriesApi } from '../api/endpoints.js';
import { Modal } from './ui.jsx';
import { SHORTCUTS } from '../utils/listKeys.js';

/**
 * Answering a query from the list, without opening it.
 *
 * Through the same door the thread uses (`POST /queries/:id/messages`), so everything that
 * follows a reply — the unread counts, the notifications, the answered state — follows this one
 * too. Enter sends, Shift+Enter starts a new line, Escape puts it away. A tag or a file still
 * needs the thread itself, which is one click away.
 */
export default function QueryQuickReply({ query, onClose, onSent }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await queriesApi.say({ id: query._id, kind: 'reply', body: text });
      onSent?.();
      onClose();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line/[0.06] bg-line/[0.02] px-4 py-3 sm:pl-[4.25rem]">
      <textarea
        autoFocus
        rows={2}
        className="input text-sm"
        aria-label={`Reply to ${query.number}`}
        placeholder={`Reply to ${query.raisedBy?.name || 'the thread'}… Enter sends, Shift+Enter for a new line`}
        value={body}
        disabled={busy}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
      />
      {error && <p role="alert" className="mt-1 text-xs text-danger-400">{error}</p>}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button type="button" className="btn-ghost h-8 px-3 py-0 text-sm" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary h-8 px-4 py-0 text-sm" disabled={busy || !body.trim()} onClick={send}>
          {busy ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </div>
  );
}

/** The list's shortcuts, on `?`. */
export function ShortcutHelp({ open, onClose }) {
  return (
    <Modal open={open} title="Keyboard shortcuts" description="On the query list" onClose={onClose} size="sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-sm">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="contents">
            <dt>
              <kbd className="rounded-md border border-line/15 bg-line/[0.05] px-2 py-0.5 font-mono text-xs font-semibold text-steel-100">
                {keys}
              </kbd>
            </dt>
            <dd className="text-steel-300">{what}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
