import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { customers as customersApi, queries as queriesApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Badge, ErrorState, Facts, FormError, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import ParticipantPicker, { describeParticipant, useParticipantOptions } from '../components/ParticipantPicker.jsx';
import QueryRoomMap from '../components/QueryRoomMap.jsx';
import QueryThread from '../components/QueryThread.jsx';
import ViewSwitch from '../components/ViewSwitch.jsx';
import { useViewMode } from '../hooks/useBoard.js';
import { formatDate, plural } from '../utils/format.js';
import { ownsRecord, selfId } from '../utils/pipeline.js';
import useCurrentLocation from '../hooks/useCurrentLocation.js';
import { WORST_ACCURACY_M, accuracyLabel, mapsUrl } from '../utils/maps.js';
import { insertMention, matchPeople, mentionAt, mentionsIn, taggablePeople } from '../utils/mentions.js';
import QueryLabels from '../components/QueryLabels.jsx';
import { announceInboxChanged } from '../components/InboxBell.jsx';

/**
 * One thread: what was asked, who is in it, and everything said since.
 *
 * Three things on this screen are worth explaining, because each had an easier alternative that
 * would have been worse.
 *
 * **The gist sits above the thread, never instead of it.** Every message is underneath, in full,
 * on the same screen. It is a way into forty replies, not a replacement for them — which is the
 * difference between saving somebody a scroll and deciding what they know. It also says whose
 * sentence it is: a model's summary and a pick of the thread's own words are different kinds of
 * thing, and a paragraph with no attribution reads as part of the record.
 *
 * **A reply and a note are separate buttons, not a checkbox.** A reply answers something and
 * moves the thread to answered; a note is an observation that does not — "rang them, no answer".
 * One control with a modifier would make the difference something people set wrongly in a hurry,
 * and the difference is the only reason anybody can tell an answered thread from a busy one.
 *
 * **Adding somebody says what it granted.** It also lets them open this buyer's record, and a
 * consequence nobody is told about is one they meet later as a colleague who knows something they
 * should not have. So the confirmation is explicit and it is shown before the press, not after.
 */

const BY_RULES =
  'Picked from what people actually typed — the question and the most recent reply. Every word '
  + 'here was written by somebody in this thread.';
const BY_MODEL =
  'Written by the model from the thread below, and not stored anywhere. It can be wrong: the '
  + 'thread underneath is the record.';

/**
 * `id` is given when the page is shown in the list's side panel; on its own route it comes from
 * the address. `inPanel` narrows the layout to one column, which is what a drawer has room for.
 */
export default function QueryDetail({ id: givenId, inPanel = false } = {}) {
  const params = useParams();
  const id = givenId || params.id;
  const { user, canWrite } = useAuth();
  const [error, setError] = useState(null);
  const [body, setBody] = useState('');
  /*
   * Tagging with @. `picked` is who was chosen from the list while typing; what is sent is the
   * ones whose "@Name" is still in the message. `tagging` is the @-word under the caret, when
   * there is one, and which suggestion is highlighted.
   */
  const box = useRef(null);
  const [picked, setPicked] = useState([]);
  /* A photo or document waiting to go with the next message. */
  const [file, setFile] = useState(null);
  const filePicker = useRef(null);
  const [tagging, setTagging] = useState(null);
  /*
   * Where the caret goes after a name is picked. Placed in a layout effect, in the same commit
   * as the new text, rather than a frame later — a fast typist's next key otherwise lands before
   * the caret has moved, in the middle of the name just inserted.
   */
  const caretAfterTag = useRef(null);
  useLayoutEffect(() => {
    if (caretAfterTag.current === null || !box.current) return;
    box.current.focus();
    box.current.setSelectionRange(caretAfterTag.current, caretAfterTag.current);
    caretAfterTag.current = null;
  });
  /* A location waiting to go with the next message — shown to the sender before it is sent. */
  const here = useCurrentLocation();
  /* Which check-in is being pinned, and which one is the buyer's site once it is. */
  const [pinningId, setPinningId] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [granted, setGranted] = useState(null);

  const { options, can, admins, loading: loadingOptions } = useParticipantOptions();
  const people = taggablePeople(options, selfId(user), admins);
  /* A draft, once one has been asked for. Held here rather than written into the box directly,
     so what it needed checking is shown beside the text somebody is about to send. */
  const [suggestion, setSuggestion] = useState(null);
  const [drafting, setDrafting] = useState(false);
  /*
   * Thread or room. The thread is the default and always will be — it is what somebody opened
   * this screen to read. The room answers the other question, the one the participant rows can
   * state but not show: who pulled whom in, which is the audit trail on an access grant.
   */
  const [mode, setMode] = useViewMode('query-detail', 'thread');

  /* The reply carries the thread and the gist side by side, so both arrive at the same moment —
     a summary that lands a beat after the messages it describes reads as a second opinion. */
  const fetch = useCallback((queryId) => queriesApi.get(queryId), []);
  const { data, loading, error: loadError, reload } = useRecord(fetch, id);

  const query = data?.data;
  const gist = data?.gist;
  const seenBy = data?.seenBy || [];
  const heard = query?.messages?.length ?? 0;

  /*
   * Opening the thread — and anything new arriving while it is open — moves my read cursor.
   *
   * Keyed on the count as well as the id, so a reply that lands while the thread is on screen
   * is not left counting as unread on the list behind it. Failure is silent on purpose: the
   * thread is on screen and readable either way, and an error banner about a read receipt
   * would be louder than the thing it failed to record.
   */
  useEffect(() => {
    if (!query?._id) return;
    /* And tell the bell, which may be holding a tag this read has just cleared. */
    queriesApi.read(query._id).then(announceInboxChanged).catch(() => {});
  }, [query?._id, heard]);

  if (loading && !query) return <Spinner label="Opening the thread" />;
  if (loadError) return <ErrorState error={loadError} onRetry={reload} />;
  if (!query) return null;

  const me = selfId(user);
  const isAsker = String(query.raisedBy?._id || query.raisedBy) === String(me);
  const closed = query.status === 'closed';

  const act = async (work) => {
    setError(null);
    setBusy(true);
    try {
      await work();
      await reload();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  /* Who the @-word under the caret could be. */
  const suggestions = tagging ? matchPeople(people, tagging.typed) : [];

  const typed = (event) => {
    setBody(event.target.value);
    const at = mentionAt(event.target.value, event.target.selectionStart);
    setTagging(at ? { ...at, index: 0 } : null);
  };

  const tag = (person) => {
    const caret = box.current?.selectionStart ?? body.length;
    const next = insertMention(body, tagging, caret, person);
    setBody(next.text);
    setPicked((current) => (current.some((row) => row._id === person._id) ? current : [...current, person]));
    setTagging(null);
    caretAfterTag.current = next.caret;
  };

  const fix = here.status === 'ready' ? here.fix : null;
  const tooVague = fix && fix.accuracyM > WORST_ACCURACY_M;
  const sayable = Boolean(body.trim()) || (fix && !tooVague) || Boolean(file);

  const say = (kind) =>
    act(async () => {
      const mentions = mentionsIn(body, picked);
      if (file) {
        /* A file goes on its own door; the words become its caption, tags ride along. */
        await queriesApi.sendFile({ id, file, body: body.trim(), kind, mentions });
        setFile(null);
      } else {
        await queriesApi.say({
          id,
          kind,
          body: body.trim(),
          ...(fix && !tooVague ? { location: fix } : {}),
          ...(mentions.length ? { mentions } : {}),
        });
      }
      setBody('');
      setPicked([]);
      setTagging(null);
      here.clear();
      /* The draft is spent once something has been sent; leaving its checklist up would have it
         describing text that is no longer in the box. */
      setSuggestion(null);
    });

  /**
   * A first draft, into the box the person was already typing in.
   *
   * It replaces whatever is there, which is the honest behaviour for a button pressed on an
   * empty box — and the button is disabled while it runs, so it cannot land on top of something
   * being typed. Nothing is said in the thread: what is recorded is whatever they send.
   */
  const draft = async () => {
    setError(null);
    setDrafting(true);
    try {
      const drafted = await queriesApi.draftReply(id);
      if (!drafted) {
        setError({ message: 'No draft came back — write it yourself, or try again in a moment.' });
        return;
      }
      setSuggestion(drafted);
      setBody(drafted.draft);
    } catch (failure) {
      setError(failure);
    } finally {
      setDrafting(false);
    }
  };

  /*
   * Whether this reader may make a check-in the buyer's site: somebody who may edit the buyer.
   * The same rule the server applies — being in the thread lets you read the customer, not
   * change their record — so the button is not offered to somebody it would refuse.
   */
  const mayPin = canWrite('customers') && ownsRecord(user, query.customer);

  const pinSite = async (message) => {
    setError(null);
    setPinningId(message._id);
    try {
      await customersApi.pinSite({ id: query.customer._id, query: query._id, message: message._id });
      setPinnedId(message._id);
    } catch (failure) {
      setError(failure);
    } finally {
      setPinningId(null);
    }
  };

  const addParticipant = (row) =>
    act(async () => {
      const result = await queriesApi.addParticipant({ id, ...row });
      setGranted({ ...result.granted, who: describeParticipant(row, options) });
      setAdding(false);
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title={query.subject}
        subtitle={
          <>
            {query.number} · about{' '}
            <Link className="link" to={`/customers/${query.customer?._id}`}>
              {query.customer?.name}
            </Link>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={query.status} />
            <ViewSwitch
              mode={mode}
              onChange={setMode}
              options={[{ value: 'thread', label: 'Thread' }, { value: 'room', label: 'Room' }]}
            />
            {/*
              Closing is the asker's, never the answerer's: an answer that did not answer is the
              common case, and letting whoever replied close it is letting them mark their own
              work. Admins can too, so somebody can tidy up after a person who has left.
            */}
            {query.isUrgent && <Badge tone="danger">Urgent</Badge>}
            {/* Administrators only: urgent puts this thread above everything on every list. */}
            {user?.role === 'admin' && (
              <button
                type="button"
                className={query.isUrgent ? 'btn-secondary' : 'btn-danger'}
                disabled={busy}
                onClick={() => act(() => queriesApi.urgent({ id, urgent: !query.isUrgent }))}
              >
                {query.isUrgent ? 'Remove urgent' : 'Mark urgent'}
              </button>
            )}
            {!closed && (isAsker || user?.role === 'admin') && (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => act(() => queriesApi.close(id))}
              >
                Close it
              </button>
            )}
            {closed && (isAsker || user?.role === 'admin') && (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => act(() => queriesApi.reopen(id))}
              >
                Re-open
              </button>
            )}
          </div>
        }
      />

      {/* Filing the thread under the list's groups. Anybody who can see it may. */}
      <QueryLabels query={query} onSaved={() => reload()} />

      <FormError error={error} />

      {granted && (
        <Notice tone="info">
          {granted.who} is now in this query, and can open {query.customer?.name}&rsquo;s record.
          {granted.people > 1 && ` That is ${plural(granted.people, 'person', 'people')}.`}
        </Notice>
      )}

      {/* The gist, labelled. `writtenBy` decides the label rather than the styling alone,
          because the two are different promises and a reader has to be able to tell which. */}
      {gist && (
        <Section
          title={gist.writtenBy === 'model' ? 'The thread so far, summarised' : 'The thread so far'}
          actions={
            gist.outstanding ? <Badge tone="progress">Nobody has answered</Badge> : null
          }
        >
          <p className="text-sm leading-relaxed text-steel-200">{gist.summary}</p>
          <p className="mt-2 text-xs leading-relaxed text-steel-500">
            {gist.writtenBy === 'model' ? BY_MODEL : BY_RULES}
          </p>
        </Section>
      )}

      {/* The room, when asked for. It replaces the columns rather than joining them: the
          participants appear in both, and one screen showing the same list twice is the reader
          wondering which of the two is the real one. */}
      {mode === 'room' && (
        <Section title="How this room grew">
          <QueryRoomMap query={query} options={options} />
        </Section>
      )}

      <div className={`grid gap-6 ${inPanel ? '' : 'lg:grid-cols-[2fr,1fr]'} ${mode === 'room' ? 'hidden' : ''}`}>
        <div className="space-y-6">
          {/*
            The conversation, in the order it happened — the question first, because that is
            what started it, then everything said since. See `QueryThread` for why it reads
            like a chat and deliberately does not look like one.
          */}
          <Section title="The conversation">
            <QueryThread
              query={query}
              me={me}
              closed={closed}
              seenBy={seenBy}
              pin={{ may: mayPin && !closed, onPin: pinSite, pinningId, pinnedId }}
            />

            {/*
              A closed thread takes neither a reply nor a note, and the thread itself says so —
              a composer that silently revived a finished question is how a closed queue fills
              back up without anybody deciding to.
            */}
            {!closed && (
              <div className="mt-6 space-y-3 border-t border-line/[0.06] pt-5">
                {/*
                  What the draft needed checking, above the box rather than inside it. A blank
                  the model left is a blank somebody has to fill, and burying that in the text
                  is how `[quantity]` reaches a colleague.
                */}
                {suggestion?.needs?.length > 0 && (
                  <Notice tone="warn">
                    <p className="font-semibold">Check before you send it</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {suggestion.needs.map((need) => <li key={need}>{need}</li>)}
                    </ul>
                  </Notice>
                )}

                {/*
                  What is about to be shared, shown before it is — the consent is this card, not a
                  setting somewhere. It says who will see it, and links to the map so the sender
                  can check their phone has put them in the right place before anybody else sees.
                */}
                {here.status === 'locating' && (
                  <Notice tone="info">Finding where you are…</Notice>
                )}
                {['denied', 'failed', 'unsupported'].includes(here.status) && (
                  <Notice tone="warn">{here.message}</Notice>
                )}
                {fix && (
                  <div className="rounded-lg border border-flame-500/25 bg-flame-500/[0.05] p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-steel-100">📍 Your location will go with this message</p>
                        <p className="mt-0.5 text-xs text-steel-400">
                          {accuracyLabel(fix.accuracyM)} · visible to everyone in this thread ·{' '}
                          <a
                            href={mapsUrl(fix)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-accent hover:underline"
                          >
                            check it on the map ↗
                          </a>
                        </p>
                        {tooVague && (
                          <p className="mt-1 text-xs font-semibold text-danger-400">
                            Your phone could only place you within {accuracyLabel(fix.accuracyM)} —
                            that is not a place. Turn on GPS or step outside, then share again.
                          </p>
                        )}
                      </div>
                      <button type="button" className="text-xs font-semibold text-steel-400 hover:text-danger-400" onClick={here.clear}>
                        Don’t share
                      </button>
                    </div>
                  </div>
                )}

                {file && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-line/[0.1] bg-line/[0.03] px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-steel-200">
                      📎 {file.name}{' '}
                      <span className="text-xs text-steel-500">· {Math.max(1, Math.round(file.size / 1024))} KB</span>
                    </span>
                    <button type="button" className="text-xs font-semibold text-steel-400 hover:text-danger-400" onClick={() => setFile(null)}>
                      Remove
                    </button>
                  </div>
                )}

                <div className="relative flex items-end gap-2">
                  {/*
                    Who the @ could be, above the box so a phone keyboard does not cover it.
                    Arrow keys move, Enter or Tab picks, Escape closes — the chat-app habits.
                  */}
                  {suggestions.length > 0 && (
                    <ul
                      role="listbox"
                      aria-label="People to tag"
                      className="absolute bottom-full left-0 z-20 mb-2 w-72 max-w-full overflow-hidden rounded-lg bg-ink-850 shadow-lg ring-1 ring-line/10"
                    >
                      {suggestions.map((person, index) => (
                        <li key={person._id} role="option" aria-selected={index === tagging.index}>
                          <button
                            type="button"
                            className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm ${
                              index === tagging.index ? 'bg-flame-500/15 text-steel-50' : 'text-steel-200 hover:bg-line/[0.05]'
                            }`}
                            /* mousedown, so the box keeps focus and the caret stays where it was. */
                            onMouseDown={(event) => {
                              event.preventDefault();
                              tag(person);
                            }}
                          >
                            <span className="truncate font-semibold">{person.name}</span>
                            <span className="shrink-0 text-xs text-steel-500">{person.department}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <textarea
                    ref={box}
                    className="input min-h-[3.25rem] flex-1"
                    rows={2}
                    placeholder={fix ? 'Add a caption, or just send' : 'Type a message — @ to tag somebody'}
                    value={body}
                    onChange={typed}
                    onBlur={() => setTagging(null)}
                    /*
                      Enter sends, Shift+Enter is a new line — chat-app muscle memory, which is
                      what the people using this type in all day. `isComposing` so an Indic or
                      other input method finishing a word with Enter does not send half of it.
                    */
                    onKeyDown={(event) => {
                      if (suggestions.length) {
                        const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
                        if (move) {
                          event.preventDefault();
                          setTagging((current) => ({
                            ...current,
                            index: (current.index + move + suggestions.length) % suggestions.length,
                          }));
                          return;
                        }
                        if ((event.key === 'Enter' || event.key === 'Tab') && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          tag(suggestions[tagging.index]);
                          return;
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setTagging(null);
                          return;
                        }
                      }
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        if (sayable && !busy) say('reply');
                      }
                    }}
                    aria-label="Message"
                  />
                  {/* A photo or a document. On a phone the picker offers the camera too. */}
                  <input
                    ref={filePicker}
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] || null);
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary h-[3.25rem] px-3.5 text-lg"
                    onClick={() => filePicker.current?.click()}
                    disabled={busy}
                    title="Add a photo or document"
                    aria-label="Add a photo or document"
                  >
                    📎
                  </button>
                  {/* Only ever on a press. See `useCurrentLocation`. */}
                  <button
                    type="button"
                    className="btn-secondary h-[3.25rem] px-3.5 text-lg"
                    onClick={here.locate}
                    disabled={busy || here.status === 'locating'}
                    title="Share where you are"
                    aria-label="Share my location"
                  >
                    📍
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <p className="mr-auto text-xs text-steel-500">
                    Enter sends a reply · Shift+Enter for a new line · @ tags somebody, and brings
                    them in if they are not already · a note records something that is not an answer.
                  </p>
                  {/*
                    Offered only where there is a model behind it. The draft lands in the box
                    above as ordinary text: from that moment it is the sender's, to change or
                    delete, and nothing is said in the thread until they press Reply.
                  */}
                  {can.draftReply && (
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      disabled={busy || drafting}
                      onClick={draft}
                    >
                      {drafting ? 'Drafting…' : 'Draft a reply'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy || !sayable}
                    onClick={() => say('note')}
                  >
                    Add a note
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || !sayable}
                    onClick={() => say('reply')}
                  >
                    Reply
                  </button>
                </div>

                {suggestion && (
                  <p className="text-right text-xs text-steel-500">
                    Drafted by the model from this thread. It is yours now — change it, and it is
                    sent under your name.
                  </p>
                )}
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section
            title="Who is in this"
            actions={
              /*
                Not offered on a closed thread, because the server refuses it there — adding
                somebody is a grant, and a finished question is no reason to open a buyer's
                record. The same rule as the composer, and said the same way: re-open it first,
                so somebody has decided the thread is live again.
              */
              closed ? (
                <span className="text-xs text-steel-500">Re-open to add anybody</span>
              ) : (
                <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
                  Pull somebody in
                </button>
              )
            }
          >
            <ul className="space-y-3">
              <li className="text-sm">
                <p className="font-medium text-steel-200">{query.raisedBy?.name}</p>
                <p className="text-xs text-steel-500">Asked it</p>
              </li>
              {(query.participants || []).map((participant) => (
                <li key={participant._id} className="text-sm">
                  <p className="font-medium text-steel-200">
                    {participant.user?.name
                      || options.find((entry) => entry.key === participant.department)?.label
                      || participant.department}
                  </p>
                  {/*
                    Who opened the door and when. Being a participant grants sight of the buyer,
                    so this list is an access grant — and an access grant nobody can account for
                    is the kind that gets quietly wide.
                  */}
                  <p className="text-xs text-steel-500">
                    {participant.user ? `In ${participant.department}. ` : 'Whole department. '}
                    Added by {participant.addedBy?.name || 'somebody'} on{' '}
                    {formatDate(participant.addedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="This query">
            <Facts
              columns={1}
              items={[
                { label: 'Customer', value: query.customer?.name },
                { label: 'Raised', value: formatDate(query.createdAt) },
                {
                  label: 'Replies',
                  value: plural(query.replyCount || 0, 'reply', 'replies'),
                },
                {
                  label: 'Waiting',
                  value: closed
                    ? null
                    : query.waitingHours < 24
                      ? plural(query.waitingHours || 0, 'hour', 'hours')
                      : plural(Math.floor((query.waitingHours || 0) / 24), 'day', 'days'),
                },
                { label: 'Closed by', value: query.closedBy?.name },
              ]}
            />
            <Link className="link mt-4 inline-block text-sm" to={`/queries?customer=${query.customer?._id}`}>
              Every query about {query.customer?.name}
            </Link>
          </Section>
        </div>
      </div>

      <Modal open={adding} title="Pull somebody into this query" onClose={() => setAdding(false)}>
        <div className="space-y-4">
          <Notice tone="warn">
            Whoever you add can read this whole thread, reply to it, pull somebody else in, and
            open {query.customer?.name}&rsquo;s customer record.
          </Notice>
          <ParticipantPicker
            options={options}
            loading={loadingOptions}
            disabled={busy}
            label="Also ask"
            onAdd={addParticipant}
          />
          <FormError error={error} />
          <div className="flex justify-end border-t border-line/[0.06] pt-4">
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>
              Done
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
