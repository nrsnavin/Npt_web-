import { useEffect, useRef, useState } from 'react';
import { Badge } from './ui.jsx';
import LocationCard from './LocationCard.jsx';
import { splitMentions } from '../utils/mentions.js';
import AuthedImage from './AuthedImage.jsx';
import { files as filesApi } from '../api/endpoints.js';

/** Opens a protected file in a new tab — the route needs the session, so it is fetched first. */
async function openFile(file) {
  const blob = await filesApi.blob(file.key);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  /* Held long enough for the new tab to read it; revoking at once shows a blank tab. */
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const sizeOf = (bytes) =>
  !bytes ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Photos as thumbnails that open full size; documents as a row that opens or downloads. */
function Attachments({ files }) {
  const [opening, setOpening] = useState(null);
  if (!files?.length) return null;
  const open = async (file) => {
    setOpening(file._id);
    try { await openFile(file); } finally { setOpening(null); }
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file) =>
        String(file.mimeType).startsWith('image/') ? (
          <AuthedImage
            key={file._id}
            attachmentKey={file.key}
            alt={file.filename}
            className="h-40 w-auto max-w-full cursor-zoom-in rounded-lg object-cover ring-1 ring-line/10"
            onClick={() => open(file)}
          />
        ) : (
          <button
            key={file._id}
            type="button"
            onClick={() => open(file)}
            disabled={opening === file._id}
            className="flex max-w-full items-center gap-2 rounded-lg border border-line/[0.1] bg-ink-850 px-3 py-2 text-left text-sm hover:bg-line/[0.05]"
          >
            <span aria-hidden>📄</span>
            <span className="min-w-0 truncate font-semibold text-steel-100">{file.filename}</span>
            <span className="shrink-0 text-xs text-steel-500">{opening === file._id ? 'Opening…' : sizeOf(file.size)}</span>
          </button>
        )
      )}
    </div>
  );
}

/**
 * A query, read the way the conversation actually happened.
 *
 * **Why this reads like a chat and deliberately does not look like one.** The record here is a
 * conversation — somebody asked, somebody answered, somebody else was pulled in — and the
 * previous arrangement stated that as a form with a list underneath: "The question" in one
 * panel, "Replies and notes (7)" in another. That is a correct description of the data and the
 * wrong shape for reading it, because the one thing a reader wants is the order things were
 * said in and who said them.
 *
 * So: one column, oldest first, each entry attributed and timed, the reader's own on the right.
 * What is *not* borrowed from a messaging app is as deliberate:
 *
 *   No bubbles with tails, no avatars with photographs, no ticks, no typing indicators. This is
 *   a record people quote from in front of a buyer, and furniture that makes it look like a
 *   phone makes it read like gossip.
 *
 *   **A note is never aligned to a side.** A reply is addressed to the thread; a note is an
 *   observation — "rang them, no answer" — and giving it a side would make it look like an
 *   answer somebody gave. It sits across the column, set back and quieter, which is also what
 *   stops a thread of nine notes from looking answered.
 *
 *   Day separators, because these threads run for weeks. "21 Sept" between two entries is the
 *   difference between a reply that came back in an hour and one that took a fortnight, and
 *   that difference is usually the point.
 */

/** The initials on the marker. Two at most — three is a monogram, not a label. */
const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

/** The clock time, which is what matters inside a day. The day itself is the separator. */
const at = (value) =>
  new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/** The day, said the way somebody would say it out loud. */
const dayOf = (value) => {
  const date = new Date(value);
  const midnight = (moment) => new Date(moment).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(Date.now()) - midnight(date)) / 86400000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
};

const sameDay = (a, b) =>
  a && b && new Date(a).toDateString() === new Date(b).toDateString();

/** One line across the column, so a fortnight's gap is visible rather than inferred. */
function DayBreak({ when }) {
  return (
    <li className="relative py-1" aria-hidden>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line/[0.08]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-steel-500">
          {dayOf(when)}
        </span>
        <span className="h-px flex-1 bg-line/[0.08]" />
      </div>
    </li>
  );
}

/**
 * One thing somebody said.
 *
 * `mine` decides the side, and only for a reply — see the note above. The name is printed on
 * every entry including the reader's own: a thread is quoted in meetings, and "me" means
 * nothing to the person it is quoted to.
 */
function Said({ entry, mine, me, pin }) {
  const note = entry.kind === 'note';
  const side = !note && mine;
  const words = String(entry.body || '').trim();

  return (
    <li className={`flex gap-3 ${side ? 'flex-row-reverse' : ''}`}>
      <span
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          note ? 'bg-line/[0.06] text-steel-400' : 'bg-flame-500/15 text-flame-400'
        }`}
        aria-hidden
      >
        {initials(entry.by?.name)}
      </span>

      <div className={`min-w-0 max-w-[46rem] flex-1 ${side ? 'text-right' : ''}`}>
        <p className={`flex flex-wrap items-baseline gap-2 ${side ? 'justify-end' : ''}`}>
          <span className="text-sm font-semibold text-steel-100">
            {entry.by?.name || 'Somebody'}
          </span>
          {entry.role && <span className="text-xs text-steel-500">{entry.role}</span>}
          {/* The full date is on the element, so a reader can check it without leaving. */}
          <time
            className="text-xs tabular-nums text-steel-500"
            dateTime={new Date(entry.at).toISOString()}
            title={new Date(entry.at).toLocaleString('en-IN')}
          >
            {at(entry.at)}
          </time>
          {note && <Badge tone="neutral">Note</Badge>}
        </p>

        <div
          className={`mt-1.5 inline-block rounded-xl px-4 py-3 text-left ${
            note
              ? 'w-full border border-dashed border-line/[0.1] bg-transparent'
              : side
                ? 'bg-flame-500/[0.09] ring-1 ring-flame-500/20'
                : 'bg-line/[0.04] ring-1 ring-line/[0.06]'
          }`}
        >
          {words && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-steel-200">
              {/* Tags drawn as tags, and the reader's own louder — that is the one they look for. */}
              {splitMentions(words, entry.mentions).map((piece, index) =>
                piece.person ? (
                  <span
                    key={index}
                    className={`rounded px-0.5 font-semibold ${
                      String(piece.person._id) === String(me)
                        ? 'bg-flame-500/20 text-flame-300'
                        : 'text-aqua-300'
                    }`}
                    title={piece.person.department ? `Tagged · ${piece.person.department}` : 'Tagged'}
                  >
                    {piece.text}
                  </span>
                ) : (
                  <span key={index}>{piece.text}</span>
                )
              )}
            </p>
          )}
          <Attachments files={entry.attachments} />
          {/* A shared location, under whatever was said with it — or on its own, since "📍" is a
              complete message. */}
          <LocationCard
            location={entry.location}
            from={entry.by?.name}
            onPin={pin?.may && entry._id ? () => pin.onPin(entry) : undefined}
            pinned={pin?.pinnedId && String(pin.pinnedId) === String(entry._id)}
            pinning={pin?.pinningId && String(pin.pinningId) === String(entry._id)}
          />
        </div>
      </div>
    </li>
  );
}

export default function QueryThread({ query, me, closed, seenBy = [], pin }) {
  const foot = useRef(null);

  /*
   * The newest entry in view when the thread is opened or answered.
   *
   * A conversation is read from the bottom — the last thing said is what the reader came for —
   * and a forty-message thread that opens at the top makes somebody scroll past a fortnight to
   * find it. `auto` rather than `smooth` on the first paint, so it is simply already there.
   */
  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'nearest' });
  }, [query.messages?.length]);

  /* The question is the first thing said, not a separate panel: it is what started this. */
  const entries = [
    {
      _id: 'question',
      kind: 'reply',
      body: query.question,
      by: query.raisedBy,
      at: query.createdAt,
      role: 'asked it',
    },
    ...(query.messages || []),
  ];

  return (
    <ol className="space-y-5">
      {entries.map((entry, index) => (
        <ThreadEntry
          key={entry._id || index}
          entry={entry}
          previous={entries[index - 1]}
          me={me}
          pin={pin}
        />
      ))}

      {/*
        Who has seen the last thing said. Accounts' real question about a thread is not "has
        anybody answered" but "has despatch even seen it", and nothing on the screen answered
        that. Only people who read *after* the last message are named, so it resets the moment
        somebody says something new — and the author is left out, since having seen what you
        wrote is not news.
      */}
      {seenBy.length > 0 && (
        <li className="text-right text-xs text-steel-500">
          Seen by {seenBy.map((reader) => reader.name).join(', ')}
        </li>
      )}

      {closed && (
        <li className="pt-1 text-center">
          <span className="rounded-full bg-line/[0.05] px-3.5 py-1.5 text-xs text-steel-400">
            {query.closedBy?.name || 'The asker'} closed this
            {query.closedAt ? ` on ${dayOf(query.closedAt)}` : ''} — re-open it if there is more
            to say.
          </span>
        </li>
      )}

      <li ref={foot} aria-hidden />
    </ol>
  );
}

/** An entry, and the day rule that may come before it. */
function ThreadEntry({ entry, previous, me, pin }) {
  const mine = String(entry.by?._id || entry.by) === String(me);

  return (
    <>
      {!sameDay(previous?.at, entry.at) && <DayBreak when={entry.at} />}
      <Said entry={entry} mine={mine} me={me} pin={pin} />
    </>
  );
}
