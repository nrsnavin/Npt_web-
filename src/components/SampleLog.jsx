import { useCallback, useRef, useState } from 'react';
import { samples as samplesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePagedFeed } from '../hooks/useRecords.js';
import { Modal, Notice, Section, Spinner } from './ui.jsx';
import AuthedImage from './AuthedImage.jsx';
import { formatDate } from '../utils/format.js';

/**
 * The working record of a sample: what the bench tried, what it looked like, and what
 * everyone said about it.
 *
 * Anyone who can see the sample can take part, including marketing, who hold read access
 * only. That is deliberate — the person who talks to the buyer is exactly who has to look at
 * a photo of the first shot and say the shoulder is wrong. Requiring write would push that
 * conversation back into WhatsApp, which is what this replaces.
 */

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

function Avatar({ name }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-flame-500/15 text-[0.625rem] font-bold text-flame-400 ring-1 ring-inset ring-flame-500/25">
      {initials(name)}
    </span>
  );
}

function CommentForm({ onSubmit }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await onSubmit(body.trim());
      setBody('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 flex gap-2">
      <input
        className="input py-1.5 text-[0.8125rem]"
        placeholder="Add a comment…"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <button type="submit" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy || !body.trim()}>
        Comment
      </button>
    </form>
  );
}

function Entry({ entry, currentUserId, isAdmin, onComment, onRemove, onRemoveComment, onOpenPhoto }) {
  const [showComment, setShowComment] = useState(entry.comments.length > 0);
  const mine = entry.author?._id === currentUserId || entry.author?.id === currentUserId;

  return (
    <li className="rounded-lg border border-line/[0.06] p-3.5">
      <div className="flex items-start gap-3">
        <Avatar name={entry.author?.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-steel-100">
              {entry.author?.name}
              <span className="ml-2 text-[0.6875rem] font-medium uppercase tracking-wide text-steel-500">
                {entry.author?.department}
              </span>
            </p>
            <span className="text-xs text-steel-500">{formatDate(entry.createdAt)}</span>
          </div>

          {entry.body && (
            <p className="mt-1 whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-steel-200">
              {entry.body}
            </p>
          )}

          {entry.attachment && (
            <button
              type="button"
              onClick={() => onOpenPhoto(entry.attachment)}
              className="mt-2 block overflow-hidden rounded-lg border border-line/[0.06] transition-opacity hover:opacity-90"
              aria-label="Open photo full size"
            >
              <AuthedImage
                attachmentKey={entry.attachment.key}
                alt={entry.body || 'Sample photo'}
                className="h-44 w-full max-w-xs object-cover"
              />
            </button>
          )}

          {entry.comments.length > 0 && (
            <ul className="mt-3 space-y-2 border-l-2 border-line/[0.08] pl-3">
              {entry.comments.map((comment) => {
                const myComment =
                  comment.author?._id === currentUserId || comment.author?.id === currentUserId;
                return (
                  <li key={comment._id} className="group flex items-start gap-2">
                    <Avatar name={comment.author?.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8125rem] leading-snug text-steel-200">
                        <span className="font-semibold text-steel-100">{comment.author?.name}</span>{' '}
                        {comment.body}
                      </p>
                      <span className="text-[0.6875rem] text-steel-500">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>
                    {(myComment || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => onRemoveComment(comment._id)}
                        className="rounded px-1 text-[0.6875rem] text-steel-500 opacity-0 transition-opacity hover:text-danger-400 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-2 flex items-center gap-3">
            {!showComment && (
              <button
                type="button"
                className="text-xs font-semibold text-steel-400 transition-colors hover:text-accent"
                onClick={() => setShowComment(true)}
              >
                Comment
              </button>
            )}
            {(mine || isAdmin) && (
              <button
                type="button"
                className="text-xs font-semibold text-steel-500 transition-colors hover:text-danger-400"
                onClick={onRemove}
              >
                Remove
              </button>
            )}
          </div>

          {showComment && <CommentForm onSubmit={onComment} />}
        </div>
      </div>
    </li>
  );
}

export default function SampleLog({ sampleId }) {
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null);
  const fileInput = useRef(null);

  const fetcher = useCallback((params) => samplesApi.logs({ id: sampleId, ...params }), [sampleId]);
  const {
    data: entries,
    pagination,
    loading,
    loadingMore,
    reload: load,
    loadMore,
    hasMore,
  } = usePagedFeed(fetcher);

  const submit = async (event) => {
    event.preventDefault();
    if (!body.trim() && !photo) return;

    setBusy(true);
    setError(null);
    try {
      await samplesApi.addLog({ id: sampleId, body: body.trim() || undefined, photo });
      setBody('');
      setPhoto(null);
      if (fileInput.current) fileInput.current.value = '';
      await load();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (run) => {
    setError(null);
    try {
      await run();
      await load();
    } catch (actError) {
      setError(actError.message);
    }
  };

  if (loading) return <Section title="Log"><Spinner label="Loading the log" /></Section>;

  // The count is the whole feed's, not what happens to be loaded — "Log (15)" on a sample
  // with sixty entries is the screen quietly disagreeing with the record.
  const total = pagination?.total ?? entries.length;

  return (
    <Section title={`Log (${total})`}>
      <form onSubmit={submit} className="mb-4 space-y-2">
        <textarea
          rows={2}
          className="input text-[0.8125rem]"
          placeholder="What happened? Attach a photo of the shot if you have one."
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-secondary cursor-pointer px-3 py-1.5 text-xs">
            {photo ? 'Change photo' : 'Attach photo'}
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              onChange={(event) => setPhoto(event.target.files?.[0] || null)}
            />
          </label>
          {photo && (
            <span className="flex items-center gap-2 text-xs text-steel-400">
              <span className="max-w-[12rem] truncate">{photo.name}</span>
              <button
                type="button"
                className="font-semibold text-steel-500 hover:text-danger-400"
                onClick={() => {
                  setPhoto(null);
                  if (fileInput.current) fileInput.current.value = '';
                }}
              >
                Remove
              </button>
            </span>
          )}
          <button
            type="submit"
            className="btn-primary ml-auto px-3 py-1.5 text-xs"
            disabled={busy || (!body.trim() && !photo)}
          >
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      {entries.length ? (
        <ul className="space-y-2.5">
          {entries.map((entry) => (
            <Entry
              key={entry._id}
              entry={entry}
              currentUserId={user?.id}
              isAdmin={user?.role === 'admin'}
              onOpenPhoto={setViewing}
              onComment={(text) =>
                act(() => samplesApi.addComment({ id: sampleId, logId: entry._id, body: text }))
              }
              onRemove={() => act(() => samplesApi.removeLog({ id: sampleId, logId: entry._id }))}
              onRemoveComment={(commentId) =>
                act(() => samplesApi.removeComment({ id: sampleId, logId: entry._id, commentId }))
              }
            />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-steel-500">
          Nothing logged yet. Photos of each shot and what was said about them live here.
        </p>
      )}

      {hasMore && (
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Show earlier entries'}
          </button>
          <p className="text-[0.6875rem] text-steel-500">
            {entries.length} of {total}
          </p>
        </div>
      )}

      <Modal
        open={Boolean(viewing)}
        title={viewing?.filename || 'Photo'}
        size="lg"
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <AuthedImage
            attachmentKey={viewing.key}
            alt={viewing.filename || 'Sample photo'}
            className="max-h-[70vh] w-full rounded-lg object-contain"
            // The one photo not to defer: the reader just clicked it.
            eager
          />
        )}
      </Modal>
    </Section>
  );
}
