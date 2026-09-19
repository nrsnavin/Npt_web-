import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { queries as queriesApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Badge, ErrorState, Facts, FormError, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import ParticipantPicker, { describeParticipant, useParticipantOptions } from '../components/ParticipantPicker.jsx';
import QueryRoomMap from '../components/QueryRoomMap.jsx';
import ViewSwitch from '../components/ViewSwitch.jsx';
import { useViewMode } from '../hooks/useBoard.js';
import { formatDate, plural } from '../utils/format.js';
import { selfId } from '../utils/pipeline.js';

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

export default function QueryDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [error, setError] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [granted, setGranted] = useState(null);

  const { options, loading: loadingOptions } = useParticipantOptions();
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

  const say = (kind) =>
    act(async () => {
      await queriesApi.say({ id, kind, body: body.trim() });
      setBody('');
    });

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

      <div className={`grid gap-6 lg:grid-cols-[2fr,1fr] ${mode === 'room' ? 'hidden' : ''}`}>
        <div className="space-y-6">
          <Section title="The question">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-steel-200">
              {query.question}
            </p>
            <p className="mt-3 text-xs text-steel-500">
              Asked by {query.raisedBy?.name} on {formatDate(query.createdAt)}
            </p>
          </Section>

          <Section title={`Replies and notes${query.messages?.length ? ` (${query.messages.length})` : ''}`}>
            {!query.messages?.length ? (
              <p className="text-sm text-steel-500">Nothing said yet.</p>
            ) : (
              <ol className="space-y-4">
                {query.messages.map((message) => (
                  <li
                    key={message._id}
                    /* A note is set back and dimmer than a reply. They are read in one column in
                       the order they happened, so the difference has to be visible without
                       reading the label — otherwise a thread of nine notes looks answered. */
                    className={`rounded-lg border p-4 ${
                      message.kind === 'note'
                        ? 'border-line/[0.04] bg-line/[0.02]'
                        : 'border-line/[0.08] bg-line/[0.04]'
                    }`}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-steel-200">
                        {message.by?.name || 'Somebody'}
                      </span>
                      <Badge tone={message.kind === 'note' ? 'neutral' : 'success'}>
                        {message.kind === 'note' ? 'Note' : 'Reply'}
                      </Badge>
                      <span className="text-xs text-steel-500">{formatDate(message.at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-steel-300">
                      {message.body}
                    </p>
                  </li>
                ))}
              </ol>
            )}

            {/*
              A closed thread takes neither, and says so rather than hiding the box: a reply that
              silently revived a finished thread is how a closed queue fills back up without
              anybody deciding to.
            */}
            {closed ? (
              <Notice tone="info">
                {query.closedBy?.name || 'The asker'} closed this on {formatDate(query.closedAt)}.
                Re-open it if there is more to say.
              </Notice>
            ) : (
              <div className="mt-5 space-y-3 border-t border-line/[0.06] pt-5">
                <textarea
                  className="input min-h-[6rem]"
                  placeholder="What you found out, or what you tried…"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <p className="mr-auto text-xs text-steel-500">
                    A reply answers the question. A note is something worth recording that does
                    not.
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy || !body.trim()}
                    onClick={() => say('note')}
                  >
                    Add a note
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || !body.trim()}
                    onClick={() => say('reply')}
                  >
                    Reply
                  </button>
                </div>
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
