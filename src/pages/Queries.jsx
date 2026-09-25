import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { queries as queriesApi } from '../api/endpoints.js';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import RaiseQuery from '../components/RaiseQuery.jsx';
import PeopleQueryMap from '../components/PeopleQueryMap.jsx';
import ViewSwitch from '../components/ViewSwitch.jsx';
import { useViewMode } from '../hooks/useBoard.js';
import { useParticipantOptions } from '../components/ParticipantPicker.jsx';
import { CustomerSelect } from '../components/pickers.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { selfId } from '../utils/pipeline.js';
import { plural } from '../utils/format.js';
import { LabelChip } from '../components/QueryLabels.jsx';
import {
  LabelDot, LabelPicker, LabelRail, SelectionBar, startRowDrag, useLabelling,
} from '../components/QueryLabelling.jsx';
import useOpenFromLink from '../hooks/useOpenFromLink.js';
import QueryQuickReply, { ShortcutHelp } from '../components/QueryQuickReply.jsx';
import { listAction, step } from '../utils/listKeys.js';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Every question this person is in.
 *
 * The list is already narrowed by the server to threads the reader is a participant in, so there
 * is no "mine vs everyone" to draw — being able to see a query at all *is* being in it. What the
 * controls do is narrow further: by whether anybody has answered, by which department was asked,
 * and by the words in it.
 *
 * **One search box, and it does two things.** The words are matched against the subject, the
 * question and every reply, always. On top of that a phrase may be read for filters — "unanswered
 * despatch queries for SCM last week" is four of them — and when it is, what was read is shown
 * as chips above the table with a way to drop them. A list that has been quietly narrowed by a
 * guess is the one failure this feature cannot afford, so the guess is never quiet.
 */

const STATUSES = [
  { value: '', label: 'Any state' },
  { value: 'open', label: 'Nobody has answered' },
  { value: 'answered', label: 'Answered' },
  { value: 'closed', label: 'Closed' },
];

/** Two letters for the buyer's circle — "SCM Garments" is "SG". */
const initialsOf = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

/**
 * When the last thing was said, the way a chat list says it.
 *
 * The clock time today, "Yesterday", the weekday within the week, the date after that. A full
 * timestamp on every row is forty numbers to read; this is one glance, and the full time is on
 * the element's title for anybody who needs it.
 */
const whenSaid = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const midnight = (moment) => new Date(moment).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(Date.now()) - midnight(date)) / 86400000);

  if (days <= 0) return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-IN', { weekday: 'short' });
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** The preview line: who said the last thing, and the start of it. "You" when it was me. */
const lastLine = (last = {}, me) => {
  const author = String(last.by?._id ?? last.by ?? '') === String(me) ? 'You' : last.by?.name;
  const text = last.text || '';
  if (!author) return text;
  return last.kind === 'question' ? `${author} asked: ${text}` : `${author}: ${text}`;
};

/** Three levels, three colours, and the words somebody would actually say. */
const URGENCY = {
  high: { tone: 'danger', label: 'Needs you' },
  normal: { tone: 'info', label: 'In hand' },
  low: { tone: 'neutral', label: 'Can wait' },
};

/**
 * How pressing this thread is *for the person reading it*, and where that reading came from.
 *
 * Two things are on the chip and both are load-bearing. The level is the colour, because a queue
 * is scanned before it is read. The sentence under it is the account — "Asked of you 2 day(s) ago
 * and nobody has answered" — and without it a red chip is a thing people learn to ignore, because
 * a priority nobody can check is a priority nobody trusts.
 *
 * And it says which reading it is. The rules count hours off the record; the model reads the
 * words and can tell a held lorry from a packing question, and can also be wrong. Labelling it
 * is the difference between the model's opinion and the plant's judgement, and they are not the
 * same thing — nothing here is stored, nobody is chased off it, and the thread is one click away.
 */
function Urgency({ reading }) {
  if (!reading) return null;
  const shape = URGENCY[reading.level] || URGENCY.normal;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <Badge tone={shape.tone}>{shape.label}</Badge>
      <p className="text-xs leading-snug text-steel-500">{reading.why}</p>
      {/* Not upper case: this is a footnote, and shouting it would make the attribution louder
          than the reason it attributes. */}
      <p className="text-[0.7rem] text-steel-600">
        {reading.readBy === 'model' ? 'Read by the model' : 'From the record'}
      </p>
    </div>
  );
}

/**
 * The model's second look at the rows that are already on screen.
 *
 * Asked for *after* the table has drawn, never as part of it. Every row arrives carrying the
 * reading the rules gave it, so the list is complete and coloured the moment it paints; this
 * replaces some of those readings a few seconds later. Folding the two together would make
 * every list load wait on a model call that is allowed to fail — a screen that looks broken for
 * eight seconds to buy a better ordering is a bad trade.
 *
 * Keyed on the ids themselves rather than on the array, because `useRecordList` hands back a new
 * array on every render and the request would never stop. An empty answer leaves the rules in
 * place, which is the ordinary case wherever no key is configured.
 */
function useModelReadings(rows, enabled) {
  const [readings, setReadings] = useState({});
  const ids = rows.map((row) => row._id).join(',');

  useEffect(() => {
    /* A new page is a different set of threads; the old readings belong to none of them. */
    setReadings({});
    if (!enabled || !ids) return undefined;

    let live = true;
    queriesApi
      .urgency(ids.split(','))
      .then((answer) => live && setReadings(answer || {}))
      /* Silence on purpose: the rows are already coloured and already honest about it. An error
         banner here would report the failure of something nobody asked for. */
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [ids, enabled]);

  return readings;
}

/**
 * The model's line for each row, over the thread's own words each row arrived with.
 *
 * The same shape as `useModelReadings` and for the same reason: the rows draw at once with the
 * rules' line and this improves them a moment later, so a list is never waiting on a model.
 */
function useModelLines(rows, enabled) {
  const [lines, setLines] = useState({});
  const ids = rows.map((row) => row._id).join(',');

  useEffect(() => {
    setLines({});
    if (!enabled || !ids) return undefined;

    let live = true;
    queriesApi
      .summaries(ids.split(','))
      .then((answer) => live && setLines(answer || {}))
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [ids, enabled]);

  return lines;
}


export default function Queries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  /* Whose threads — "what is Anita carrying", which is the Monday question. */
  const [person, setPerson] = useState('');
  /* Only the threads I have been tagged in — "who needs me", asked in one press. */
  const [taggedOnly, setTaggedOnly] = useState(false);
  /* One label's group, from the chip bar. */
  const [label, setLabel] = useState('');
  /* Rows ticked for filing together, a drag in progress, and the row whose # menu is open. */
  const [selected, setSelected] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);
  /* The keyboard's place in the list, the row being answered in place, and the help sheet. */
  const [cursor, setCursor] = useState(-1);
  const [replyFor, setReplyFor] = useState(null);
  const [showKeys, setShowKeys] = useState(false);
  const navigate = useNavigate();
  const { warn } = useToast();
  const [page, setPage] = useState(1);
  const [asking, setAsking] = useState(false);
  /* The command bar's "New …" arrives as `?new=1` with the form to open. */
  useOpenFromLink(() => setAsking(true));
  /*
   * "Search the words only": the escape hatch from a reading that got it wrong. It has to be a
   * real parameter rather than a re-typing of the phrase, because the same words would be read
   * the same way again — `ai=false` is what the server takes to mean "do not read this".
   */
  const [wordsOnly, setWordsOnly] = useState(false);
  /*
   * List or map. The list is the default and answers "what is open"; the map answers the other
   * question — who is carrying it — which a list ordered by when a thread last moved cannot
   * show at all.
   */
  const [mode, setMode] = useViewMode('queries');

  const { options, can } = useParticipantOptions();
  const { user } = useAuth();
  const me = selfId(user);
  const term = useDebounced(search);

  /* Arriving from a customer's screen, or chosen in the box below: that buyer's threads. Kept in
     the address so the view survives a refresh and can be sent to somebody. */
  const customer = searchParams.get('customer') || undefined;

  const chooseCustomer = (id) => {
    if (id) searchParams.set('customer', id);
    else searchParams.delete('customer');
    setSearchParams(searchParams, { replace: true });
    setPage(1);
  };

  /*
   * Who may be asked after: everybody, or — once a department is chosen — the people in it.
   *
   * Narrowing with the department rather than beside it, because the two together are one
   * question ("anybody in despatch" then "Anita in despatch"), and a person list that keeps
   * offering the other four departments after one is picked makes the second choice a hunt.
   */
  const people = useMemo(
    () => (department ? options.filter((entry) => entry.key === department) : options),
    [options, department]
  );

  const params = useMemo(
    () => ({
      page,
      /*
       * A page of twenty is right for a table somebody reads a row at a time. A map of twenty
       * out of sixty is a picture of a third of the department's load, which is worse than no
       * picture — so the map asks for the lot, under the same filters.
       */
      limit: mode === 'map' ? 100 : 20,
      search: term || undefined,
      status: status || undefined,
      department: department || undefined,
      person: person || undefined,
      customer,
      tagged: taggedOnly ? 'me' : undefined,
      label: label || undefined,
      ai: wordsOnly ? 'false' : undefined,
    }),
    [page, term, status, department, person, customer, taggedOnly, label, wordsOnly, mode]
  );

  const { data, pagination, meta, loading, error, reload } = useRecordList(queriesApi.list, params);

  /* Filing from the list: a drop, the selection bar or a row's # menu all land here. A filing
     that carried the ticked rows is done with them, so the ticks clear. */
  const fileWith = useLabelling(reload);
  const file = async (request) => {
    const result = await fileWith(request);
    if (result?.updated?.length && request.add && request.ids.some((id) => selected.includes(id))) setSelected([]);
    return result;
  };
  const known = (meta?.labels || []).map((entry) => entry.label);
  const toggleSelected = (id) =>
    setSelected((current) => (current.includes(id) ? current.filter((each) => each !== id) : [...current, id]));
  /* A new page or filter is a different set of rows; a tick on one that has gone is a trap. */
  useEffect(() => {
    setSelected([]);
    setPickerFor(null);
    setReplyFor(null);
    setCursor(-1);
  }, [params]);

  /*
   * The list from the keyboard — J/K to move, Enter to open, X to tick, L for labels, R to reply,
   * E to close, ? for the sheet. Only on the list view, never while typing or while a dialog has
   * the keyboard; see `utils/listKeys.js`.
   */
  useEffect(() => {
    if (mode === 'map') return undefined;
    const onKey = (event) => {
      const action = listAction(event);
      if (!action) return;
      if (action === 'help') {
        setShowKeys(true);
        return;
      }
      if (!data.length) return;
      event.preventDefault();
      if (action === 'next' || action === 'previous') {
        const next = step(cursor, action, data.length);
        setCursor(next);
        document.querySelector(`[data-row="${next}"]`)?.scrollIntoView({ block: 'nearest' });
        return;
      }
      const row = data[cursor];
      if (!row) {
        setCursor(0);
        return;
      }
      if (action === 'open') navigate(`/queries/${row._id}`);
      if (action === 'select') toggleSelected(row._id);
      if (action === 'label') setPickerFor(row._id);
      if (action === 'reply') setReplyFor(row._id);
      if (action === 'close') {
        queriesApi.close(row._id).then(reload).catch((failure) => warn(`${row.number} was not closed`, failure.message));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, cursor, mode]);
  const chooseLabel = (next) => {
    setLabel(next);
    setPage(1);
  };

  /* The model's reading of the rows already on screen, over the rules reading each row came
     with. Asked for only where there is a key behind it — see `useModelReadings`. */
  const readings = useModelReadings(data, Boolean(can.readUrgency));
  const urgencyOf = (row) => readings[row._id] || row.urgency;
  /* The line under each row: the model's once it has read the page, the thread's own till then. */
  const modelLines = useModelLines(data, Boolean(can.readUrgency));
  /* The thread's own words add nothing to a thread that is still only its question — the row
     already shows that — so the line waits until there is a reply or the model's reading. */
  const lineOf = (row) => {
    const line = modelLines[row._id] || row.gist;
    if (line?.writtenBy !== 'model' && !(row.messages || []).length) return null;
    return line;
  };

  /* What the phrase was taken to mean, when it was read at all. Absent on every plain search
     and whenever no key is configured, which is the ordinary case. */
  const read = meta?.read;

  const departmentLabel = (key) => options.find((entry) => entry.key === key)?.label || key;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Queries"
        subtitle="Questions about a buyer, and everybody pulled in to answer them"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ViewSwitch
              mode={mode}
              onChange={setMode}
              options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]}
            />
            <button type="button" className="btn-primary" onClick={() => setAsking(true)}>
              + Ask a question
            </button>
          </div>
        }
      />

      {/*
        The labels down the side on a wide screen — each a filter to press and a place to drop a
        query on. A phone keeps the chips above the list and files through each row's # menu.
      */}
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="hidden lg:sticky lg:top-20 lg:block">
        <LabelRail
          labels={meta?.labels || []}
          active={label}
          onChoose={chooseLabel}
          onFile={file}
          dragging={dragging}
        />
      </aside>
      <div className="min-w-0 space-y-6">
      <div className="card space-y-3 p-4">
        {/*
          Threads I was tagged in, one press away. The count is of live ones, whatever else is
          narrowed, so it says how many people are waiting on me even when the list is filtered.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={taggedOnly}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
              taggedOnly
                ? 'bg-aqua-500/20 text-aqua-300 ring-aqua-500/40'
                : 'bg-transparent text-steel-300 ring-line/15 hover:bg-line/[0.05]'
            }`}
            onClick={() => {
              setTaggedOnly((current) => !current);
              setPage(1);
            }}
          >
            @ Tagged me{meta?.taggedOpen ? ` · ${meta.taggedOpen}` : ''}
          </button>

          {/*
            The groups, with how many live threads are in each. Counted over everything the
            reader can see rather than the current page, so the bar holds still while somebody
            clicks through it. A label nobody can see is not offered.
          */}
          {(meta?.labels || []).map((entry) => (
            <LabelChip
              className="lg:hidden"
              key={entry.label}
              label={entry.label}
              count={entry.count}
              active={label === entry.label}
              onClick={() => {
                setLabel((current) => (current === entry.label ? '' : entry.label));
                setPage(1);
              }}
            />
          ))}
          {/* A chosen label whose last open thread was closed still needs a way to be dropped. */}
          {label && !(meta?.labels || []).some((entry) => entry.label === label) && (
            <LabelChip className="lg:hidden" label={label} active onClick={() => { setLabel(''); setPage(1); }} />
          )}
        </div>
        <input
          className="input"
          aria-label="Search queries"
          placeholder="Search the question, the replies, or describe what you are after…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            /* A new phrase deserves a fresh reading: the escape hatch was from the last one,
               not a preference. */
            setWordsOnly(false);
            setPage(1);
          }}
        />

        {/*
          Four narrowings, labelled, on one line.

          Labelled rather than a row of bare dropdowns reading "Any state / Any department /
          Any person", because those three say what they are only while they are untouched — the
          moment somebody picks "Despatch" the control no longer says which question it answered,
          and a list narrowed by a filter nobody can name is the one everybody mistakes for an
          empty plant.
        */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="State">
            <select
              className="input"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Asked of">
            <select
              className="input"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                /* A person in the department just dropped is no longer a possible answer, and
                   leaving them set would narrow the list to nothing without saying why. */
                setPerson('');
                setPage(1);
              }}
            >
              <option value="">Any department</option>
              {options.map((entry) => (
                <option key={entry.key} value={entry.key}>{entry.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Anybody in particular">
            <select
              className="input"
              value={person}
              onChange={(event) => {
                setPerson(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Anybody</option>
              {people.map((entry) => (
                <optgroup key={entry.key} label={entry.label}>
                  {entry.people.map((candidate) => (
                    <option key={candidate._id} value={candidate._id}>{candidate.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="About">
            <CustomerSelect
              value={customer || ''}
              onChange={chooseCustomer}
              allowCreate={false}
              emptyLabel="Any customer"
              aria-label="Customer"
            />
          </Field>
        </div>

        {/*
          What the phrase was read as. Shown because the reader has to be able to tell a short
          list from a narrowed one — and told plainly that it was read rather than chosen, since
          a filter nobody set is one nobody thinks to remove.
        */}
        {read && (
          <Notice tone="info">
            <div className="flex flex-wrap items-center gap-2">
              <span>Read your words as:</span>
              {read.customerName && <Badge tone="info">Customer: {read.customerName}</Badge>}
              {read.department && <Badge tone="info">{departmentLabel(read.department)}</Badge>}
              {read.status && <Badge status={read.status} />}
              {read.days && <Badge tone="info">Last {plural(read.days, 'day', 'days')}</Badge>}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => {
                  setWordsOnly(true);
                  setPage(1);
                }}
              >
                Search the words only
              </button>
            </div>
          </Notice>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : !data.length ? (
        <EmptyState
          title="Nothing here"
          description={
            term || status || department || person || customer
              ? 'Nothing matches those filters. Widen them, or ask a new question.'
              : 'You are not in any query yet. Ask one, or wait to be pulled into somebody else’s.'
          }
          action={
            <button type="button" className="btn-primary" onClick={() => setAsking(true)}>
              Ask a question
            </button>
          }
        />
      ) : mode === 'map' ? (
        <div className="card p-4">
          <PeopleQueryMap
            queries={data}
            options={options}
            scope={department ? departmentLabel(department) : 'Who owes an answer'}
          />
        </div>
      ) : (
        /*
          An inbox, not a table.

          The table answered "what exists"; the question people open this screen with is "what
          is new since I last looked", and that is what a chat inbox answers at a glance: the
          last thing said, who said it, when, and how many things I have not seen. Bold rows and
          a count are the whole of it — the same grammar as the WhatsApp the people using this
          already read all day, which is the point.

          The urgency stays, one line down and quieter, because it answers a different question
          (what needs *me*) and a thread can be unread and not urgent, or read and still owed.
        */
        <div>
        <ShortcutHelp open={showKeys} onClose={() => setShowKeys(false)} />
      <SelectionBar
          count={selected.length}
          ids={selected}
          known={known}
          onFile={file}
          onClear={() => setSelected([])}
        />
        <ul className="card divide-y divide-line/[0.06]">
          {data.map((row, rowIndex) => {
            const unread = row.unread || 0;
            const last = row.last || {};
            /* Tagged in it at all, and whether that tag is still unread. */
            const tagged = row.tagged > 0;
            const taggedUnread = row.taggedMe > 0;

            return (
              <li
                key={row._id}
                data-row={rowIndex}
                className={`group relative ${rowIndex === cursor ? 'z-[1] outline outline-2 -outline-offset-2 outline-flame-500/60 [li:first-child&]:rounded-t-xl' : ''}`}
              >
                {/* The row and its buttons share a box, so the buttons stay on the row when the
                    reply box opens underneath it. */}
                <div className="relative">
                <Link
                  to={`/queries/${row._id}`}
                  /*
                   * Draggable onto a label in the rail. Grabbing a ticked row carries every ticked
                   * row; grabbing any other carries just that one.
                   */
                  draggable
                  onDragStart={(event) => {
                    startRowDrag(event, selected.includes(row._id) ? selected : [row._id]);
                    setDragging(true);
                  }}
                  onDragEnd={() => setDragging(false)}
                  className={`flex gap-3 border-l-4 px-4 py-3.5 transition-colors hover:bg-line/[0.03]
                    [li:first-child>&]:rounded-t-xl [li:last-child>&]:rounded-b-xl ${
                    selected.includes(row._id)
                      ? 'border-flame-500 bg-flame-500/[0.08]'
                      : row.isUrgent
                      ? 'border-danger-500 bg-danger-500/[0.06]'
                      : tagged
                      ? 'border-aqua-400 bg-aqua-500/[0.06]'
                      : unread
                        ? 'border-transparent bg-flame-500/[0.03]'
                        : 'border-transparent'
                  }`}
                >
                  {/*
                    The initials turn into a tick box on hover, as a mail inbox does — select
                    several, then drag them together or file them from the bar at the foot.
                  */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected.includes(row._id)}
                    aria-label={`Select ${row.number}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleSelected(row._id);
                    }}
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      selected.includes(row._id)
                        ? 'bg-flame-500 text-white'
                        : 'bg-line/[0.07] text-steel-300 hover:bg-flame-500/20'
                    }`}
                  >
                    {selected.includes(row._id) ? (
                      '✓'
                    ) : (
                      <>
                        <span className={selected.length ? 'hidden' : 'group-hover:hidden'}>{initialsOf(row.customer?.name)}</span>
                        <span className={`${selected.length ? '' : 'hidden group-hover:inline'} h-4 w-4 rounded border-2 border-steel-400`} />
                      </>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p
                        className={`truncate text-sm ${
                          unread ? 'font-bold text-steel-50' : 'font-semibold text-steel-200'
                        }`}
                      >
                        {row.subject}
                      </p>
                      <time
                        className={`shrink-0 text-xs tabular-nums ${
                          unread ? 'font-semibold text-flame-400' : 'text-steel-500'
                        }`}
                        dateTime={last.at}
                        title={last.at ? new Date(last.at).toLocaleString('en-IN') : undefined}
                      >
                        {whenSaid(last.at)}
                      </time>
                    </div>

                    <div className="mt-0.5 flex items-center justify-between gap-3">
                      <p className={`truncate text-sm ${unread ? 'text-steel-200' : 'text-steel-400'}`}>
                        <span className="text-steel-500">{row.customer?.name || 'No customer'} · </span>
                        {lastLine(last, me)}
                      </p>
                      {/* The tag and the count sit together at the right, as one signal. */}
                      <span className="flex shrink-0 items-center gap-1.5">
                      {tagged && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-bold ring-1 ring-inset ${
                            taggedUnread
                              ? 'bg-aqua-600 text-white ring-aqua-600'
                              : 'bg-aqua-500/15 text-aqua-300 ring-aqua-500/25'
                          }`}
                          aria-label={taggedUnread ? 'You were tagged in something you have not read' : 'You were tagged in this thread'}
                          title={taggedUnread ? 'Tagged — not read yet' : 'You were tagged in this thread'}
                        >
                          @ you
                        </span>
                      )}
                      {unread > 0 && (
                        <span
                          className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center
                            rounded-full bg-flame-500 px-1.5 text-[0.7rem] font-bold text-white"
                          aria-label={`${unread} unread`}
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                      </span>
                    </div>

                    {/*
                      Where the thread stands, in a line. The model's when it has read the page,
                      and marked so — it is a reading of the thread, not part of it, and the
                      thread itself is one press away. The thread's own words otherwise.
                    */}
                    {lineOf(row)?.summary && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-steel-400">
                        {lineOf(row).writtenBy === 'model' && (
                          <span
                            className="mr-1.5 rounded bg-aqua-500/15 px-1 py-px text-[0.65rem] font-bold uppercase tracking-wide text-aqua-300"
                            title="Summarised by AI from the thread — open it to read every message"
                          >
                            AI
                          </span>
                        )}
                        {lineOf(row).summary}
                      </p>
                    )}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pr-28">
                      {/* The row's labels, each with an × to take it off. */}
                      {(row.labels || []).map((name) => (
                        <span
                          key={name}
                          className="group/label inline-flex items-center gap-1.5 rounded-full bg-line/[0.05] py-0.5 pl-2 pr-1 text-[0.7rem] font-semibold text-steel-300 ring-1 ring-inset ring-line/10"
                        >
                          <LabelDot label={name} />
                          {name}
                          <button
                            type="button"
                            aria-label={`Take #${name} off ${row.number}`}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              file({ ids: [row._id], remove: name });
                            }}
                            className="rounded-full px-1 text-steel-500 opacity-0 transition-opacity hover:text-danger-400 group-hover/label:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {/* Flagged by an administrator — why this row is at the top. */}
                      {row.isUrgent && <Badge tone="danger">Urgent</Badge>}
                      <Urgency reading={urgencyOf(row)} />
                      <Badge status={row.status} />
                      <span className="text-xs text-steel-500">
                        {row.number}
                        {/* Who was asked, so a queue reads as a queue. A row naming a person
                            says the person. */}
                        {row.participants?.length
                          ? ` · asked of ${row.participants
                              .map((entry) => entry.user?.name || departmentLabel(entry.department))
                              .join(', ')}`
                          : ''}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* The # menu: the row's labels as switches, and a box to start a new one.
                    Shown on hover, and always on a touch screen, which has no hover and no drag. */}
                <div className="absolute bottom-2.5 right-3 flex items-center gap-1">
                  {row.status !== 'closed' && (
                    <button
                      type="button"
                      aria-label={`Reply to ${row.number}`}
                      title="Reply without opening (R)"
                      onClick={() => setReplyFor((open) => (open === row._id ? null : row._id))}
                      className={`flex h-7 items-center rounded-lg px-2 text-xs font-semibold text-steel-400 ring-1 ring-inset ring-line/10 transition hover:bg-line/[0.06] hover:text-steel-100 focus:opacity-100 [@media(hover:none)]:opacity-100 ${
                        replyFor === row._id ? 'bg-line/[0.08] opacity-100' : 'bg-ink-850 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      ↩ Reply
                    </button>
                  )}
                  <div className="relative">
                  <button
                    type="button"
                    aria-label={`Labels for ${row.number}`}
                    aria-expanded={pickerFor === row._id}
                    /* Kept from the menu's click-away, so pressing # again closes it rather than
                       closing and at once reopening it. */
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => setPickerFor((open) => (open === row._id ? null : row._id))}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-steel-400 ring-1 ring-inset ring-line/10 transition hover:bg-line/[0.06] hover:text-steel-100 focus:opacity-100 [@media(hover:none)]:opacity-100 ${
                      pickerFor === row._id ? 'bg-line/[0.08] opacity-100' : 'bg-ink-850 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    #
                  </button>
                  {pickerFor === row._id && (
                    <LabelPicker
                      known={known}
                      current={row.labels || []}
                      onClose={() => setPickerFor(null)}
                      onToggle={(name, on) => file({ ids: [row._id], ...(on ? { add: name } : { remove: name }) })}
                    />
                  )}
                  </div>
                </div>
                </div>

                {/* Answering in place — R, or the row's Reply button. */}
                {replyFor === row._id && (
                  <QueryQuickReply query={row} onClose={() => setReplyFor(null)} onSent={reload} />
                )}
              </li>
            );
          })}
        </ul>
        {/* Said once, under the list, where somebody looking for a faster way will find it. */}
        <p className="mt-2 hidden text-right text-xs text-steel-500 lg:block">
          Tip: press <kbd className="rounded border border-line/15 px-1 font-mono">?</kbd> for keyboard shortcuts
        </p>
        </div>
      )}

      {/* Paging belongs to the table. The map asked for everything the filters matched, so a
          pager under it would offer to show a second picture of the same question. */}
      {mode !== 'map' && <Pagination pagination={pagination} onChange={setPage} />}
      </div>
      </div>


      <RaiseQuery
        open={asking}
        customer={customer}
        onClose={() => setAsking(false)}
        onRaised={reload}
      />
    </div>
  );
}
