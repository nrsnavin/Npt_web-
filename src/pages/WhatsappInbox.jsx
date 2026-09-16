import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { whatsapp as inboxApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecord } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Spinner,
} from '../components/ui.jsx';
import EnquiryFields from '../components/EnquiryFields.jsx';
import { CustomerSelect } from '../components/pickers.jsx';
import { formatDate, humanise, plural } from '../utils/format.js';
import { buildEnquiryPayload } from '../utils/pipeline.js';

/**
 * The WhatsApp inbox [BLUEPRINT §41] — the front door.
 *
 * Everything else in this application is a register: a list of records somebody creates. This is
 * the one screen where the work arrives on its own and has to be *triaged*, and that difference
 * decides the shape.
 *
 * **Two panes, not a table and a detail page.** A conversation is read and acted on in the same
 * breath — you open it to find out whether it is a real enquiry, and if it is you raise one
 * there and then. A table that navigated away would lose your place in the queue on every row,
 * and triaging twenty messages is exactly the job where that cost is paid twenty times. The
 * queue stays on the left and the conversation opens beside it.
 *
 * **The four things §41 says happen to a message are the four controls.** It is matched to a
 * customer, de-duplicated into one thread per number, assigned to somebody, and converted into
 * an enquiry. Matching and de-duplication are the integration's job and have already happened
 * by the time anything reaches this screen; what a person does here is the other two, plus the
 * judgement of which queue it belongs in. So the right-hand pane is: who is this, who owns it,
 * which queue, and the one button that ends the conversation's life as a conversation.
 *
 * **The conversion refusal is answered before it happens.** The server will not raise an enquiry
 * from a thread with no customer on it — rightly, since an enquiry against nobody is not an
 * enquiry. Rather than let somebody fill in a form and be told no, the customer picker sits
 * above the button and the button says what it is waiting for. Linking a customer here also
 * writes the number onto that customer, so the *next* message from them matches by itself:
 * the one piece of manual matching in the system is a one-off rather than a chore.
 */

/* --------------------------------- The queues --------------------------------- */

/**
 * §41.5's queues, in the order the inbox is worked.
 *
 * `converted` and `closed` are finished with and drop out of the working view, which is why
 * "Everything open" is the default rather than a filter somebody has to apply — an inbox whose
 * default shows months of settled conversations is one nobody can work from.
 */
const QUEUES = [
  { value: 'new', label: 'New', hint: 'Nobody has looked at these yet' },
  { value: 'waiting_for_customer', label: 'Waiting on them', hint: 'We have replied and are waiting' },
  { value: 'sample_requested', label: 'Sample asked for', hint: 'They want to see one first' },
  { value: 'pricing_required', label: 'Needs a price', hint: 'Waiting on a costing' },
  { value: 'converted', label: 'Converted', hint: 'Now an enquiry' },
  { value: 'closed', label: 'Closed', hint: 'Nothing came of it' },
];

const queueLabel = (value) => QUEUES.find((queue) => queue.value === value)?.label || humanise(value);

/** How the integration found the customer, said plainly [§41.2]. */
const MATCH_COPY = {
  customer: { tone: 'success', label: 'Known customer', hint: 'The number is on their record' },
  lead: { tone: 'accent', label: 'Open lead', hint: 'A lead already carries this number' },
  unknown: { tone: 'warn', label: 'Nobody we know', hint: 'This number is on no record' },
};

/**
 * When a message arrived, at the resolution somebody actually wants.
 *
 * "Today" and a clock time for the ones that matter, a date for the rest. An inbox timestamped
 * "16 Sept 2026" on every row tells you nothing about which message is the oldest unanswered
 * one, which is the question the column exists to answer.
 */
function whenever(value) {
  if (!value) return '—';
  const at = new Date(value);
  const time = at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((Date.now() - at.getTime()) / 86400000);

  if (days < 1 && at.getDate() === new Date().getDate()) return time;
  if (days < 7) return `${at.toLocaleDateString('en-IN', { weekday: 'short' })} ${time}`;
  return formatDate(value);
}

/* ------------------------------- The queue, left ------------------------------- */

/**
 * One conversation in the list.
 *
 * Leads with whoever it is — the customer's name where we know it, the sender's WhatsApp
 * profile name where we do not, and the number as the last resort. Never the profile name over
 * a known customer: what somebody set on their phone this week is not what the plant calls
 * them, and two names for one buyer is how a colleague fails to recognise their own account.
 */
function ThreadRow({ thread, active, onOpen }) {
  const who = thread.customer?.name || thread.profileName || thread.number;
  const match = MATCH_COPY[thread.matchedBy] || MATCH_COPY.unknown;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(thread)}
        aria-current={active ? 'true' : undefined}
        className={`w-full border-l-2 px-4 py-3 text-left transition-colors ${
          active
            ? 'border-accent bg-line/[0.05]'
            : 'border-transparent hover:border-line/20 hover:bg-line/[0.03]'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${thread.isUnread ? 'font-bold text-steel-50' : 'font-semibold text-steel-200'}`}>
            {who}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-steel-500">
            {whenever(thread.lastMessageAt)}
          </span>
        </div>

        <p className={`mt-0.5 truncate text-xs ${thread.isUnread ? 'text-steel-300' : 'text-steel-500'}`}>
          {thread.lastMessagePreview || 'No text — a photo or a file'}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* An unread mark rather than a badge: it is a state of this row, not a fact about
              the conversation, and it disappears the moment the row is opened. */}
          {thread.isUnread && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="Unread" />}
          <span className="text-[0.7rem] font-semibold text-steel-400">{queueLabel(thread.status)}</span>
          {thread.matchedBy !== 'customer' && (
            <span className={`text-[0.7rem] font-semibold ${
              thread.matchedBy === 'unknown' ? 'text-warn-400' : 'text-steel-500'
            }`}>
              · {match.label}
            </span>
          )}
          {/* The §41.5 queue that actually costs money: a conversation nobody owns is the one
              that goes unanswered, so it says so on the row rather than only in a filter. */}
          {!thread.assignedTo && (
            <span className="text-[0.7rem] font-semibold text-danger-400">· Nobody owns it</span>
          )}
        </div>
      </button>
    </li>
  );
}

/* ---------------------------- The conversation, right ---------------------------- */

/** One inbound message. Inbound only — nothing in this system sends WhatsApp yet [§42]. */
function Message({ message }) {
  return (
    <li className="max-w-[85%] rounded-xl rounded-tl-sm border border-line/[0.08] bg-line/[0.04] px-3.5 py-2.5">
      {message.body && <p className="whitespace-pre-wrap text-sm text-steel-100">{message.body}</p>}

      {/*
        The photos, named rather than drawn.

        The provider keeps the file and hands us a URL that needs the provider's own credentials
        to fetch, so an <img> here would render a broken icon on every attachment — worse than
        no picture, because it reads as the system losing the buyer's artwork. Until the files
        are copied into our own storage the honest thing is to say one arrived and what it was.
      */}
      {message.media?.length > 0 && (
        <p className={`text-xs text-steel-400 ${message.body ? 'mt-2' : ''}`}>
          📎 {plural(message.media.length, 'attachment', 'attachments')}
          {' — '}
          {message.media.map((file) => file.contentType || 'file').join(', ')}
          <span className="mt-0.5 block text-steel-600">
            Still held by WhatsApp; not yet copied into the system
          </span>
        </p>
      )}

      <p className="mt-1.5 text-[0.7rem] text-steel-600">{whenever(message.receivedAt)}</p>
    </li>
  );
}

/**
 * Raising an enquiry from a conversation [§41.4].
 *
 * The customer, the owner, the source and the conversation reference all come off the thread and
 * are not asked for — that is the whole promise of §41.4, that converting is not re-entering.
 * What is asked for is the requirement, because it is the part that was never in the system: a
 * buyer typing "400mm shirt hanger, 40,000, need it by Diwali" has told you the requirement in
 * prose, and somebody still has to turn that into a model from the register [§28].
 *
 * The same `EnquiryFields` the enquiry form and lead conversion use, so a field added to an
 * enquiry appears here without anybody remembering this screen exists.
 */
function ConvertDialog({ thread, open, onClose, onDone }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  /* `undefined` rather than `''`, matching the enquiry form: the picker's empty value has to
     be absent, not an empty string. `buildEnquiryPayload` guards this too. */
  const [mould, setMould] = useState(undefined);
  const [spec, setSpec] = useState({});
  const [isNewDevelopment, setNewDevelopment] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    reset({});
    setMould(undefined);
    setSpec({});
    setNewDevelopment(false);
    setError(null);
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      const payload = buildEnquiryPayload(values, { mould, isNewDevelopment, spec });
      /* The source is the conversation itself and the server sets it; sending one from here
         would let this screen claim an enquiry came in by email. */
      delete payload.source;
      const result = await inboxApi.convert({ id: thread._id, ...payload });
      onDone(result);
    } catch (failure) {
      setError(failure);
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Raise an enquiry for ${thread?.customer?.name || 'this buyer'}`}
      description="What they asked for. The buyer, the owner and this conversation come across on their own."
    >
      <form onSubmit={submit} className="space-y-5">
        {error && <Notice tone="danger">{error.message}</Notice>}

        <EnquiryFields
          register={register}
          errors={errors}
          mould={mould}
          onMouldChange={setMould}
          spec={spec}
          onSpecChange={setSpec}
          newDevelopment={isNewDevelopment}
          onNewDevelopmentChange={setNewDevelopment}
        />

        <div className="flex justify-end gap-2 border-t border-line/[0.08] pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Raising…' : 'Raise the enquiry'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The right-hand pane: who this is, who owns it, which queue, and what was said.
 *
 * The three controls sit above the messages rather than below them, because they are what the
 * screen is for. Reading the conversation is how you decide; the deciding is the work.
 */
function Conversation({ id, mayWrite, team, onChanged, onConverted }) {
  const fetchThread = useCallback((threadId) => inboxApi.get(threadId), []);
  const { data: thread, setData, loading, error, reload } = useRecord(fetchThread, id);

  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [converting, setConverting] = useState(false);

  /*
   * Opening a conversation marks it read — a separate write, because a GET that writes is one
   * nobody expects. The list is told as well as this pane, or the row keeps its unread dot
   * while the conversation sits open beside it.
   */
  useEffect(() => {
    if (!id || !mayWrite) return;
    let cancelled = false;
    inboxApi
      .read(id)
      .then((updated) => {
        if (cancelled) return;
        setData(updated);
        onChanged(updated, { quiet: true });
      })
      /* A failed read-receipt is not worth a banner over the conversation somebody opened. */
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, mayWrite, setData, onChanged]);

  const patch = async (payload) => {
    setBusy(true);
    setFailure(null);
    try {
      const updated = await inboxApi.update({ id, ...payload });
      setData(updated);
      onChanged(updated);
    } catch (problem) {
      setFailure(problem);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !thread) return <Spinner label="Opening the conversation" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!thread) return null;

  const match = MATCH_COPY[thread.matchedBy] || MATCH_COPY.unknown;
  const mine = String(thread.assignedTo?._id) === String(user?.id);
  /* The refusal the server would give, worked out before anybody fills in a form. */
  const blocked = !thread.customer
    ? 'Link this conversation to a customer first — an enquiry has to be against somebody.'
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line/[0.08] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-steel-50">
              {thread.customer ? (
                <Link to={`/customers/${thread.customer._id}`} className="hover:text-accent">
                  {thread.customer.name}
                </Link>
              ) : (
                thread.profileName || 'Unknown sender'
              )}
            </h2>
            <p className="mt-0.5 text-xs text-steel-400">
              {thread.number}
              {thread.profileName && thread.customer ? ` · calls themselves "${thread.profileName}"` : ''}
              {' · '}
              {plural(thread.messageCount || 0, 'message', 'messages')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={match.tone}>{match.label}</Badge>
            <Badge status={thread.status}>{queueLabel(thread.status)}</Badge>
          </div>
        </div>

        {/* Where the conversation already went, when it went somewhere. */}
        {thread.enquiry && (
          <p className="mt-2 text-xs text-steel-300">
            Became enquiry{' '}
            <Link to={`/enquiries/${thread.enquiry._id}`} className="font-semibold text-accent hover:underline">
              {thread.enquiry.number}
            </Link>
          </p>
        )}
        {thread.lead && !thread.enquiry && (
          <p className="mt-2 text-xs text-steel-300">
            Against lead{' '}
            <Link to={`/leads/${thread.lead._id}`} className="font-semibold text-accent hover:underline">
              {thread.lead.number}
            </Link>{' '}
            — {thread.lead.company}
          </p>
        )}
      </div>

      {/* ------------------------------- The decisions ------------------------------- */}
      {mayWrite && (
        <div className="space-y-4 border-b border-line/[0.08] bg-line/[0.02] px-5 py-4">
          {failure && <Notice tone="danger">{failure.message}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            {/*
              The match, by hand, for the case matching cannot solve: a buyer messaging from a
              number nobody has on file. Doing it here rather than sending somebody off to edit
              the customer record is the point — the number goes onto that customer at the same
              time, so the next message matches by itself.
            */}
            <Field
              label="Who is this"
              hint={thread.customer ? match.hint : 'Linking them also files this number against them'}
            >
              <CustomerSelect
                value={thread.customer?._id || ''}
                onChange={(value) => value && patch({ customer: value })}
                emptyLabel="Nobody linked yet"
                disabled={busy}
              />
            </Field>

            <Field label="Which queue" hint={QUEUES.find((q) => q.value === thread.status)?.hint}>
              <select
                className="input"
                value={thread.status}
                disabled={busy}
                onChange={(event) => patch({ status: event.target.value })}
              >
                {QUEUES.map((queue) => (
                  <option
                    key={queue.value}
                    value={queue.value}
                    /* Converted is what raising an enquiry does, not something typed. The server
                       refuses it outright; the picker simply does not offer the dead end. */
                    disabled={queue.value === 'converted' && !thread.enquiry}
                  >
                    {queue.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-steel-400">
                {thread.assignedTo ? (
                  <>
                    Owned by <span className="font-semibold text-steel-200">{thread.assignedTo.name}</span>
                    {thread.assignedByRotation && <span className="text-steel-600"> · by rotation</span>}
                  </>
                ) : (
                  <span className="font-semibold text-danger-400">Nobody owns this conversation</span>
                )}
              </span>

              {!mine && (
                <button
                  type="button"
                  className="btn-secondary px-2.5 py-1 text-xs"
                  disabled={busy}
                  onClick={() => patch({ assignedTo: user.id })}
                >
                  Take it
                </button>
              )}

              {/*
                Handing it to somebody else is a decision about who owns an account, so the
                picker is only drawn for a reader the server offered more than one name to —
                which is management. See the owners endpoint.
              */}
              {team.length > 1 && (
                <select
                  className="input w-44 py-1 text-xs"
                  value={thread.assignedTo?._id || ''}
                  disabled={busy}
                  aria-label="Hand it to"
                  onChange={(event) => event.target.value && patch({ assignedTo: event.target.value })}
                >
                  <option value="">Hand it to…</option>
                  {team.map((person) => (
                    <option key={person._id} value={person._id}>
                      {person.name} ({person.open})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              {blocked && <span className="text-xs text-warn-400">{blocked}</span>}
              <button
                type="button"
                className="btn-primary"
                disabled={busy || Boolean(blocked) || Boolean(thread.enquiry)}
                onClick={() => setConverting(true)}
              >
                {thread.enquiry ? 'Already an enquiry' : 'Raise an enquiry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------- What was said --------------------------------- */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <ul className="space-y-2.5">
          {(thread.messages || []).map((message) => (
            <Message key={message._id} message={message} />
          ))}
        </ul>

        {!thread.messages?.length && (
          <p className="py-8 text-center text-sm text-steel-500">Nothing in this conversation yet.</p>
        )}

        {/*
          What the plant thought, kept with the conversation rather than in somebody's head.
          Saved on blur rather than per keystroke: a note is written in one go, and a request
          per character would put the conversation's history behind a queue of writes.
        */}
        {mayWrite && (
          <div className="mt-5 border-t border-line/[0.08] pt-4">
            <Field label="Notes" hint="For colleagues — the buyer never sees this">
              <textarea
                className="input min-h-[4rem]"
                defaultValue={thread.notes || ''}
                disabled={busy}
                placeholder="Anything the next person picking this up should know"
                onBlur={(event) => {
                  if (event.target.value !== (thread.notes || '')) patch({ notes: event.target.value });
                }}
              />
            </Field>
          </div>
        )}
      </div>

      <ConvertDialog
        thread={thread}
        open={converting}
        onClose={() => setConverting(false)}
        onDone={({ enquiry, thread: updated }) => {
          setConverting(false);
          setData(updated);
          onChanged(updated);
          onConverted(enquiry);
        }}
      />
    </div>
  );
}

/* ----------------------------------- The screen ----------------------------------- */

export default function WhatsappInbox() {
  const { canWrite } = useAuth();
  const mayWrite = canWrite('whatsapp');

  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState('');
  const [unassigned, setUnassigned] = useState(false);
  const [owner, setOwner] = useState('');
  const [openId, setOpenId] = useState(null);
  /* Held here rather than in the conversation pane, so it survives the list reload that moves
     the conversation out of the working view. */
  const [raised, setRaised] = useState(null);

  const [rows, setRows] = useState(null);
  const [counts, setCounts] = useState({ stageCounts: {}, unassigned: 0 });
  const [error, setError] = useState(null);

  const term = useDebounced(search);

  const fetchOwners = useCallback(() => inboxApi.owners(), []);
  const { data: owners } = useRecord(fetchOwners, 'whatsapp-owners');
  const team = owners?.team || [];
  const holders = owners?.data || [];

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await inboxApi.list({
        search: term || undefined,
        status: queue || undefined,
        /* Everything not finished with, unless a specific queue was chosen — an inbox whose
           default shows months of settled conversations is one nobody can work from. */
        open: queue ? undefined : 'true',
        unassigned: unassigned ? 'true' : undefined,
        assignedTo: owner || undefined,
        limit: 50,
      });
      setRows(response.data);
      setCounts({
        stageCounts: response.stageCounts || {},
        unassigned: response.unassigned || 0,
      });
    } catch (problem) {
      setError(problem);
      setRows([]);
    }
  }, [term, queue, unassigned, owner]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * A conversation changed under the right-hand pane; the row on the left has to agree.
   *
   * Patched in place rather than refetched, and the distinction matters on this screen more
   * than most: re-running the list would re-sort it, and a row that jumps out from under the
   * cursor the moment you assign it is how somebody loses the conversation they were reading.
   * The counts do move, so those are refreshed — but only for a change somebody made, which is
   * what `quiet` marks: a read receipt fires on every open and must not restack the queue.
   */
  const onChanged = useCallback((updated, { quiet = false } = {}) => {
    setRows((current) =>
      (current || []).map((row) => (String(row._id) === String(updated._id) ? { ...row, ...updated } : row))
    );
    if (!quiet) load();
  }, [load]);

  const tiles = useMemo(
    () =>
      QUEUES.filter((entry) => !['converted', 'closed'].includes(entry.value)).map((entry) => ({
        ...entry,
        count: counts.stageCounts[entry.value]?.leads || 0,
      })),
    [counts]
  );

  /*
   * The open conversation is tracked by id alone, not by finding it in `rows`.
   *
   * Deriving it from the list looked tidier and had one bad consequence, which converting made
   * obvious: raising an enquiry moves a conversation to Converted, Converted is not in the
   * working view, so the row left the list — and the pane reading it vanished mid-sentence,
   * taking the confirmation with it. Somebody would be left staring at an empty panel with no
   * way to tell whether the enquiry had been raised. The pane fetches by id, so it has no need
   * of the row; it stays until another conversation is opened.
   */

  return (
    <div className="mx-auto max-w-[110rem]">
      <PageHeader
        title="WhatsApp inbox"
        subtitle="Every message that came in, who it is from, and what became of it"
      />

      {/*
        The queues as the navigation, because §41.5's queues *are* how this screen is read: the
        question is never "show me all conversations", it is "what is new" and "what is nobody
        looking after". A second click on the queue in force clears it.
      */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tiles.map((entry) => {
          const active = queue === entry.value && !unassigned;
          return (
            <button
              key={entry.value}
              type="button"
              aria-pressed={active}
              title={entry.hint}
              onClick={() => {
                setQueue(active ? '' : entry.value);
                setUnassigned(false);
              }}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? 'border-accent/60 bg-line/[0.05] text-steel-50'
                  : 'border-line/[0.08] text-steel-300 hover:border-line/20'
              }`}
            >
              <span className="font-semibold">{entry.label}</span>
              <span className="ml-2 tabular-nums text-steel-500">{entry.count}</span>
            </button>
          );
        })}

        {/* The queue that costs money, kept apart from the rest because it cuts across them:
            a conversation nobody owns can be in any queue, and is the one that goes unanswered. */}
        <button
          type="button"
          aria-pressed={unassigned}
          onClick={() => {
            setUnassigned((current) => !current);
            setQueue('');
          }}
          className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
            unassigned
              ? 'border-danger-500/60 bg-danger-500/[0.06] text-steel-50'
              : counts.unassigned
                ? 'border-danger-500/40 text-danger-400 hover:border-danger-500/60'
                : 'border-line/[0.08] text-steel-300 hover:border-line/20'
          }`}
        >
          <span className="font-semibold">Nobody owns it</span>
          <span className="ml-2 tabular-nums">{counts.unassigned}</span>
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search number, name or message…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {/*
          Drawn only where the server offered more than one name. A marketing person is given
          exactly themselves [§29], so for them this picker would be a control with one option
          and no purpose — see the owners endpoint.
        */}
        {holders.length > 1 && (
          <select
            className="input w-52"
            value={owner}
            aria-label="Owner"
            onChange={(event) => setOwner(event.target.value)}
          >
            <option value="">Everybody's conversations</option>
            {holders.map((person) => (
              <option key={person._id} value={person._id}>
                {person.name} ({person.open})
              </option>
            ))}
          </select>
        )}
      </div>

      {raised && (
        <div className="mb-4">
          <Notice tone="success">
            Raised enquiry{' '}
            <Link to={`/enquiries/${raised._id}`} className="font-semibold underline">
              {raised.number}
            </Link>
            . The conversation has moved to Converted, so it has left the working queues.
          </Notice>
        </div>
      )}

      {error && <ErrorState error={error} onRetry={load} />}
      {rows === null && !error && <Spinner label="Loading the inbox" />}

      {rows?.length === 0 && !openId && !error && (
        <EmptyState
          title="Nothing in this queue"
          description={
            queue || unassigned || term
              ? 'Try another queue, or clear the search.'
              : 'Messages appear here the moment WhatsApp forwards one. If nothing ever arrives, the webhook is not pointed at this server — see docs/WHATSAPP-SETUP.md.'
          }
        />
      )}

      {/* `|| openId`, so converting the last conversation in a queue does not take the panel
          reading it off the screen along with the row. */}
      {(rows?.length > 0 || openId) && (
        <div className="card grid overflow-hidden lg:grid-cols-[22rem_1fr]">
          <ul className="max-h-[38rem] divide-y divide-line/[0.04] overflow-y-auto border-b border-line/[0.08] lg:max-h-[46rem] lg:border-b-0 lg:border-r">
            {(rows || []).map((thread) => (
              <ThreadRow
                key={thread._id}
                thread={thread}
                active={String(thread._id) === String(openId)}
                onOpen={(row) => {
                  setOpenId(row._id);
                  setRaised(null);
                }}
              />
            ))}
          </ul>

          <div className="max-h-[38rem] overflow-hidden lg:max-h-[46rem]">
            {openId ? (
              <Conversation
                key={openId}
                id={openId}
                mayWrite={mayWrite}
                team={team}
                onChanged={onChanged}
                onConverted={setRaised}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 py-16 text-center">
                <p className="text-sm text-steel-500">
                  Pick a conversation to read it, say who it is from, and raise an enquiry from it.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
