import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { queries as queriesApi } from '../api/endpoints.js';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import RaiseQuery from '../components/RaiseQuery.jsx';
import { useParticipantOptions } from '../components/ParticipantPicker.jsx';
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

export default function Queries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [asking, setAsking] = useState(false);
  /*
   * "Search the words only": the escape hatch from a reading that got it wrong. It has to be a
   * real parameter rather than a re-typing of the phrase, because the same words would be read
   * the same way again — `ai=false` is what the server takes to mean "do not read this".
   */
  const [wordsOnly, setWordsOnly] = useState(false);

  const { options } = useParticipantOptions();
  const term = useDebounced(search);

  /* Arriving from a customer's screen: that buyer's threads. Kept in the address so the view
     survives a refresh and can be sent to somebody. */
  const customer = searchParams.get('customer') || undefined;

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      search: term || undefined,
      status: status || undefined,
      department: department || undefined,
      customer,
      ai: wordsOnly ? 'false' : undefined,
    }),
    [page, term, status, department, customer, wordsOnly]
  );

  const { data, pagination, meta, loading, error, reload } = useRecordList(queriesApi.list, params);

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
          <button type="button" className="btn-primary" onClick={() => setAsking(true)}>
            + Ask a question
          </button>
        }
      />

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="input min-w-[16rem] flex-1"
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
          <select
            className="input w-auto"
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
          <select
            className="input w-auto"
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any department</option>
            {options.map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.label}</option>
            ))}
          </select>
          {customer && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                searchParams.delete('customer');
                setSearchParams(searchParams);
                setPage(1);
              }}
            >
              Show every customer
            </button>
          )}
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
            term || status || department
              ? 'Nothing matches those filters. Widen them, or ask a new question.'
              : 'You are not in any query yet. Ask one, or wait to be pulled into somebody else’s.'
          }
          action={
            <button type="button" className="btn-primary" onClick={() => setAsking(true)}>
              Ask a question
            </button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Query</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Asked by</th>
                  <th className="px-4 py-3">Waiting</th>
                  <th className="px-4 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row._id} className="row-hover">
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
                    <td className="px-4 py-3.5 text-steel-300">
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

      <Pagination pagination={pagination} onChange={setPage} />

      <RaiseQuery
        open={asking}
        customer={customer}
        onClose={() => setAsking(false)}
        onRaised={reload}
      />
    </div>
  );
}
