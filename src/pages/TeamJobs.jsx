import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * Team jobs [server: teamJobs.service] — the tasks Admin and marketing gave a team with no enquiry
 * behind it, in one plain list: the job, the buyer, what was asked, and where it is now. Opening
 * one shows each team's step and what each did [pages/TeamJobDetail.jsx]. A marketing person
 * reads the jobs they gave and their buyers'; Admin every job.
 */

const STATES = [['open', 'Open'], ['done', 'Done'], ['all', 'All']];

/** Where it is now, as a pill: green when done, amber while a team has it. */
export function NowPill({ now }) {
  if (!now) return null;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${now.done ? 'bg-success-500/15 text-success-400' : 'bg-warn-500/15 text-warn-400'}`}>
      {now.words}
    </span>
  );
}

export function useTeamJobs({ state = 'open', search = '' } = {}) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => workspace.todos.teamJobs({ state, ...(search ? { search } : {}) }).then((data) => { setRows(data); setError(null); }).catch(setError), [state, search]);
  useEffect(() => { load(); }, [load]);
  return { rows, error, load };
}

/** On the home page: the jobs you gave still open, where each is now — the full list one tap away. */
export function TeamJobsCard() {
  const { rows } = useTeamJobs({ state: 'open' });
  if (!rows?.length) return null;
  return (
    <section className="card space-y-3 p-4 sm:p-5" aria-label="Tasks you gave">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-steel-50">Tasks you gave</h2>
          <p className="text-sm text-steel-400">Asked without an enquiry — where each is now.</p>
        </div>
        <Link to="/team-jobs" className="text-sm font-semibold text-accent hover:underline">All team jobs →</Link>
      </div>
      <ul className="divide-y divide-line/[0.06]">
        {rows.slice(0, 6).map((row) => (
          <li key={row._id}>
            <Link to={`/team-jobs/${row._id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-accent">
              <span className="min-w-0">
                <span className="font-semibold text-steel-100">{row.number || 'Job'}</span>
                <span className="text-sm text-steel-300"> · {row.customer?.name || 'No buyer'} · {row.asked.what}</span>
              </span>
              <NowPill now={row.now} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function TeamJobs() {
  const [params, setParams] = useSearchParams();
  const state = params.get('state') || 'open';
  const [search, setSearch] = useState(params.get('search') || '');
  const [applied, setApplied] = useState(search);
  const { rows, error, load } = useTeamJobs({ state, search: applied });
  useEffect(() => {
    const timer = setTimeout(() => setApplied(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const setState = (next) => {
    const query = {};
    if (next !== 'open') query.state = next;
    if (applied) query.search = applied;
    setParams(query, { replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Team jobs" subtitle="Tasks given to a team without an enquiry — where each is now, and what each team did." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATES.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={state === key} onClick={() => setState(key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${state === key ? 'fill-primary border-transparent' : 'border-line/[0.12] text-steel-300'}`}>
            {label}
          </button>
        ))}
        <input className="input w-full sm:ml-auto sm:w-72" placeholder="Search job, buyer, model…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search team jobs" />
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!rows && !error && <Spinner label="Loading team jobs" />}
      {rows && !rows.length && (
        <EmptyState title={state === 'done' ? 'No finished jobs' : 'No open jobs'} description="Tasks you give a team without an enquiry — from + Assign Task — show here, each with where it is now." />
      )}
      {rows?.length > 0 && (
        <>
          {/* A table on a wide screen. */}
          <div className="card hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-left text-sm" aria-label="Team jobs">
              <thead className="border-b border-line/[0.08] text-xs font-semibold uppercase tracking-wide text-steel-400">
                <tr>
                  <th className="px-3 py-2.5">Job</th>
                  <th className="px-3 py-2.5">Buyer</th>
                  <th className="px-3 py-2.5">What was asked</th>
                  <th className="px-3 py-2.5">Where it is now</th>
                  <th className="px-3 py-2.5">EDD</th>
                  <th className="px-3 py-2.5">Given by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id} className="border-b border-line/[0.05] align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5"><Link to={`/team-jobs/${row._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.number || 'Job'}</Link></td>
                    <td className="px-3 py-2.5 text-steel-100">{row.customer?.name || '—'}</td>
                    <td className="max-w-[18rem] px-3 py-2.5">
                      <span className="font-semibold text-steel-100">{row.asked.what}</span>
                      <span className="block text-xs text-steel-400">{[row.asked.models.join(', '), row.asked.note].filter(Boolean).join(' — ') || row.asked.team}</span>
                    </td>
                    <td className="px-3 py-2.5"><NowPill now={row.now} /><span className="mt-0.5 block text-xs text-steel-500">{row.teams.join(' → ')}</span></td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-steel-200">{row.edd ? formatDate(row.edd) : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-steel-300">{row.raisedBy || '—'}<span className="block text-steel-500">{formatDate(row.raisedAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Cards on a phone. */}
          <ul className="space-y-2 md:hidden">
            {rows.map((row) => (
              <li key={row._id}>
                <Link to={`/team-jobs/${row._id}`} className="card block space-y-1 p-3">
                  <p className="flex items-baseline justify-between gap-2"><span className="font-semibold text-steel-100">{row.number || 'Job'}</span><span className="text-xs text-steel-500">{formatDate(row.raisedAt)}</span></p>
                  <p className="text-sm text-steel-200">{row.customer?.name || 'No buyer'} · {row.asked.what}</p>
                  <NowPill now={row.now} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
