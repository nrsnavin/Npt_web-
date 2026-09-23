import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { formatDate, plural } from '../utils/format.js';

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

/** How long a thread has been sitting, in the words somebody would use. */
const waitingFor = (hours) => {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return 'Just now';
  if (hours < 24) return plural(hours, 'hour', 'hours');
  return plural(Math.floor(hours / 24), 'day', 'days');
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
    <div className="space-y-1">
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

export default function Queries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  /* Whose threads — "what is Anita carrying", which is the Monday question. */
  const [person, setPerson] = useState('');
  const [page, setPage] = useState(1);
  const [asking, setAsking] = useState(false);
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
      ai: wordsOnly ? 'false' : undefined,
    }),
    [page, term, status, department, person, customer, wordsOnly, mode]
  );

  const { data, pagination, meta, loading, error, reload } = useRecordList(queriesApi.list, params);

  /* The model's reading of the rows already on screen, over the rules reading each row came
     with. Asked for only where there is a key behind it — see `useModelReadings`. */
  const readings = useModelReadings(data, Boolean(can.readUrgency));
  const urgencyOf = (row) => readings[row._id] || row.urgency;

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

      <div className="card space-y-3 p-4">
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
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  {/* First, because a queue is scanned before it is read and this is the column
                      that says where to start. Given a width, because a sentence in an
                      auto-sized column is a sentence the subject beside it squeezes to four
                      words a line. */}
                  <th className="w-[15rem] px-4 py-3">For you</th>
                  <th className="px-4 py-3">Query</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Asked by</th>
                  <th className="whitespace-nowrap px-4 py-3">Waiting</th>
                  <th className="px-4 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row._id} className="row-hover align-top">
                    <td className="px-4 py-3.5">
                      <Urgency reading={urgencyOf(row)} />
                    </td>
                    {/*
                      The subject leads and the number sits under it, because the subject is what
                      somebody scans for — "September invoice disputed" is how a person remembers
                      a thread, and QRY-2026-0014 is how it is quoted afterwards.
                    */}
                    <td className="px-4 py-3.5">
                      <Link
                        to={`/queries/${row._id}`}
                        className="font-semibold text-steel-100 hover:text-accent"
                      >
                        {row.subject}
                      </Link>
                      <p className="text-xs text-steel-500">
                        {row.number}
                        {/* Who was asked, so a queue reads as a queue rather than a list of
                            subjects. A row naming a person says the person. */}
                        {row.participants?.length
                          ? ` · ${row.participants
                              .map((entry) => entry.user?.name || departmentLabel(entry.department))
                              .join(', ')}`
                          : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-steel-200">{row.customer?.name || '—'}</td>
                    <td className="px-4 py-3.5">
                      <p className="text-steel-300">{row.raisedBy?.name || '—'}</p>
                      <p className="text-xs text-steel-500">{formatDate(row.createdAt)}</p>
                    </td>
                    {/* Only meaningful while it is open — the record returns null once it is
                        closed, and a thread nobody owes an answer on should not wear a number
                        that keeps climbing. */}
                    <td className="whitespace-nowrap px-4 py-3.5 text-steel-300">
                      {row.status === 'closed' ? '—' : waitingFor(row.waitingHours)}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge status={row.status} />
                      {row.replyCount > 0 && (
                        <p className="mt-1 text-xs text-steel-500">
                          {plural(row.replyCount, 'reply', 'replies')}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paging belongs to the table. The map asked for everything the filters matched, so a
          pager under it would offer to show a second picture of the same question. */}
      {mode !== 'map' && <Pagination pagination={pagination} onChange={setPage} />}

      <RaiseQuery
        open={asking}
        customer={customer}
        onClose={() => setAsking(false)}
        onRaised={reload}
      />
    </div>
  );
}
