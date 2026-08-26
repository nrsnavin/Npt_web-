import { useState } from 'react';
import { useWorkspace } from './WorkspaceContext.jsx';
import DockIcon from './DockIcon.jsx';
import { Badge, Notice } from '../ui.jsx';
import { formatDate, humanise } from '../../utils/format.js';

const CATEGORY_TONE = {
  urgent: 'danger',
  production: 'progress',
  quality: 'info',
  people: 'success',
  general: 'neutral',
};

const CATEGORIES = ['general', 'production', 'quality', 'people', 'urgent'];

function Composer({ onClose }) {
  const { addAnnouncement } = useWorkspace();
  const [form, setForm] = useState({ title: '', body: '', category: 'general', pinned: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addAnnouncement(form);
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-b border-line/[0.06] px-4 py-3">
      <input
        className="input py-1.5 text-[0.8125rem]"
        placeholder="Announcement title"
        value={form.title}
        onChange={(event) => setForm({ ...form, title: event.target.value })}
        required
      />
      <textarea
        rows={3}
        className="input mt-2 resize-none py-1.5 text-[0.8125rem]"
        placeholder="What does the plant need to know?"
        value={form.body}
        onChange={(event) => setForm({ ...form, body: event.target.value })}
        required
      />
      <div className="mt-2 flex items-center gap-2">
        <select
          aria-label="Category"
          className="input flex-1 py-1 text-xs"
          value={form.category}
          onChange={(event) => setForm({ ...form, category: event.target.value })}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {humanise(category)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-steel-300">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-line/25"
            checked={form.pinned}
            onChange={(event) => setForm({ ...form, pinned: event.target.checked })}
          />
          Pin
        </label>
        <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary px-3 py-1 text-xs" disabled={busy}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
      {error && (
        <div className="mt-2">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
    </form>
  );
}

export default function AnnouncementsPanel() {
  const { announcements, announcementMeta, markAnnouncementRead, removeAnnouncement } = useWorkspace();
  const [composing, setComposing] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const open = (item) => {
    setExpanded(expanded === item.id ? null : item.id);
    if (!item.read) markAnnouncementRead(item.id);
  };

  return (
    <div className="flex h-full flex-col">
      {announcementMeta.canPublish &&
        (composing ? (
          <Composer onClose={() => setComposing(false)} />
        ) : (
          <div className="border-b border-line/[0.06] px-4 py-2.5">
            <button
              type="button"
              className="btn-secondary w-full py-1.5 text-xs"
              onClick={() => setComposing(true)}
            >
              <DockIcon name="plus" className="h-3.5 w-3.5" />
              New announcement
            </button>
          </div>
        ))}

      <div className="flex-1 overflow-y-auto">
        {announcements.length ? (
          <ul className="divide-y divide-line/[0.04]">
            {announcements.map((item) => (
              <li key={item.id} className="group px-4 py-3">
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-expanded={expanded === item.id}
                  className="block w-full text-left"
                >
                  <div className="flex items-start gap-2">
                    {/* An unread marker earns the accent; everything else stays quiet. */}
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        item.read ? 'bg-transparent' : 'bg-flame-500'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[0.8125rem] leading-snug ${
                          item.read ? 'font-medium text-steel-200' : 'font-bold text-steel-50'
                        }`}
                      >
                        {item.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge tone={CATEGORY_TONE[item.category]}>{humanise(item.category)}</Badge>
                        {item.pinned && <span className="text-[0.6875rem] text-flame-400">Pinned</span>}
                        <span className="text-[0.6875rem] text-steel-500">
                          {formatDate(item.publishedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {expanded === item.id && (
                  <div className="mt-2.5 pl-3.5">
                    <p className="text-[0.8125rem] leading-relaxed text-steel-300">{item.body}</p>
                    <div className="mt-2 flex items-center gap-3">
                      {item.author && (
                        <span className="text-[0.6875rem] text-steel-500">
                          Posted by {item.author.name}
                        </span>
                      )}
                      {item.departments?.length > 0 && (
                        <span className="text-[0.6875rem] text-steel-500">
                          For {item.departments.map(humanise).join(', ')}
                        </span>
                      )}
                      {announcementMeta.canPublish && (
                        <button
                          type="button"
                          className="ml-auto rounded p-1 text-steel-500 hover:text-danger-400"
                          aria-label={`Delete ${item.title}`}
                          onClick={() => removeAnnouncement(item.id)}
                        >
                          <DockIcon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-10 text-center text-[0.8125rem] text-steel-500">
            No announcements right now.
          </p>
        )}
      </div>
    </div>
  );
}
