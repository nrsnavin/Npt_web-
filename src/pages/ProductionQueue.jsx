import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { handoffs as handoffsApi, production as productionApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import TaskPanel from '../components/TaskPanel.jsx';
import DepartmentTaskDialog from '../components/DepartmentTaskDialog.jsx';
import { ErrorState, PageHeader, TableSkeleton } from '../components/ui.jsx';
import { formatDate, formatRelative } from '../utils/format.js';
import { departmentLabel } from '../utils/pipeline.js';
import { EDD_BANDS } from '../utils/productionQueue.js';

/**
 * The production queue — the plant's one list of what is on the press, in the order the goods
 * are due [server: productionQueue.controller].
 *
 * Every department reads it: Dispatch to see what is still being made, Assembly and Quality to
 * see what is coming their way, marketing to answer a buyer without ringing the floor. Production
 * works from it: the status moves from the row, a problem is reported from the row, the EDD is
 * given on the task, and Assembly is tasked with one press where the hanger needs it.
 *
 * Each row carries the other teams on the same enquiry — Assembly, Printing, Quality, Dispatch —
 * at their own status, so "who is it waiting for" is read off the row rather than asked.
 */

const REFRESH_MS = 60 * 1000;

const BAND_CHIP = {
  late: 'bg-danger-500/15 text-danger-400',
  today: 'bg-warn-500/15 text-warn-400',
  week: 'bg-accent/15 text-accent',
  later: 'bg-line/[0.08] text-steel-300',
  none: 'bg-warn-500/15 text-warn-400',
};
const BAND_LABEL = { late: 'Late', today: 'Today', week: 'This week', later: 'Later', none: 'No EDD' };

/** The team filters beside the bands: who the row is waiting for. */
const TEAM_FILTERS = [
  { key: 'assembly', label: 'Needs assembly', test: (row) => row.needsAssembly },
  { key: 'quality', label: 'With Quality', test: (row) => row.teams.quality && !row.teams.quality.completed },
  { key: 'dispatch', label: 'Dispatch waiting', test: (row) => row.teams.despatch && !row.teams.despatch.completed },
  { key: 'issues', label: 'Problems', test: (row) => row.task.issue },
  { key: 'unclaimed', label: 'Not picked up', test: (row) => !row.task.with },
];

function Tile({ label, value, hint, tone = 'text-steel-50', active, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`card px-4 py-3 text-left transition ${active ? 'ring-1 ring-flame-500/60' : 'hover:bg-line/[0.04]'}`}>
      <p className="text-xs font-semibold text-steel-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-steel-500">{hint}</p>}
    </button>
  );
}

/** One team's state on the row: open at a status, a problem, done, or not asked. */
function TeamCell({ team, needed = false, label }) {
  if (!team) {
    return needed
      ? <span className="rounded-full bg-warn-500/15 px-2 py-0.5 text-xs font-semibold text-warn-400">Needed</span>
      : <span className="text-xs text-steel-500">—</span>;
  }
  const tone = team.completed ? 'bg-success-500/15 text-success-400' : team.issue ? 'bg-danger-500/15 text-danger-400' : 'bg-accent/15 text-accent';
  return (
    <span className="inline-flex max-w-full flex-col gap-0.5">
      <span className={`max-w-[8.5rem] rounded-xl px-2 py-0.5 text-xs font-semibold leading-tight ${tone}`} title={`${label}: ${team.label}`}>{team.label}</span>
      {team.with?.name && !team.completed && <span className="truncate text-xs text-steel-500">{team.with.name}</span>}
    </span>
  );
}

export default function ProductionQueue() {
  const { user, departments = [], isAdmin, canWrite } = useAuth();
  const catalogue = useHandoffCatalogue();
  const me = String(user?.id || user?._id || '');
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [asOf, setAsOf] = useState(null);
  const [opened, setOpened] = useState(null);
  const [assemblyFor, setAssemblyFor] = useState(null);
  const [search, setSearch] = useState('');
  const band = params.get('band') || 'all';
  const team = params.get('team') || 'all';
  const setFilter = (next) => {
    const merged = { band, team, ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, value]) => value && value !== 'all')), { replace: true });
  };

  const load = useCallback(() => productionApi.queue()
    .then((reply) => { setRows(reply.data || []); setMeta(reply.meta || null); setAsOf(new Date()); setError(null); })
    .catch((failure) => setError(failure)), []);
  useEffect(() => { load(); }, [load]);
  /* A board on the floor: it keeps itself fresh. */
  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const worksProduction = isAdmin || departments.includes('production') || canWrite('production');
  const mayWork = (row) => isAdmin || departments.includes('production') || String(row.task.with?._id || '') === me;
  const productionButton = buttonFor(catalogue, 'ask_edd');
  const statuses = productionButton?.form?.statuses || [];
  const problems = statuses.filter((entry) => entry.issue);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const teamTest = TEAM_FILTERS.find((entry) => entry.key === team)?.test;
    return (rows || []).filter((row) => {
      if (band !== 'all' && band !== 'mine' && row.band !== band) return false;
      if (band === 'mine' && String(row.task.with?._id || '') !== me) return false;
      if (teamTest && !teamTest(row)) return false;
      if (!term) return true;
      return [row.enquiry.number, row.enquiry.customer?.name, row.enquiry.model, row.order?.number, row.task.with?.name]
        .filter(Boolean).some((text) => String(text).toLowerCase().includes(term));
    });
  }, [rows, band, team, search, me]);

  /* The row opens into its task, read whole from the enquiry's tasks — the panel works the task. */
  const open = async (row, status) => {
    try {
      const reply = await handoffsApi.list(row.enquiry._id);
      const task = (reply?.data || []).find((entry) => String(entry._id) === String(row.task._id));
      if (task) setOpened({ task, status, row });
    } catch (failure) {
      setError(failure);
    }
  };

  if (error && !rows) return <ErrorState error={error} onRetry={load} />;
  if (!rows) return <div className="mx-auto max-w-7xl"><TableSkeleton rows={6} columns={8} /></div>;

  const bands = meta?.bands || {};
  const teams = meta?.teams || {};

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Production queue"
        subtitle={`What is on the press, in the order the goods are due · ${rows.length} open${asOf ? ` · as of ${formatRelative(asOf)}` : ''}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {worksProduction && <Link to="/departments/production" className="btn-secondary">Production desk</Link>}
            <Link to="/production" className="btn-secondary">Production status</Link>
            <button type="button" className="btn-secondary" onClick={load}>Refresh</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Tile label="Late" value={bands.late || 0} tone={bands.late ? 'text-danger-400' : 'text-success-400'} hint="Past the EDD" active={band === 'late'} onClick={() => setFilter({ band: band === 'late' ? 'all' : 'late' })} />
        <Tile label="Due today" value={bands.today || 0} tone={bands.today ? 'text-warn-400' : 'text-steel-50'} hint="EDD is today" active={band === 'today'} onClick={() => setFilter({ band: band === 'today' ? 'all' : 'today' })} />
        <Tile label="Due tomorrow" value={teams.dueTomorrow || 0} hint="Ready for Dispatch by tonight" active={false} onClick={() => setFilter({ band: 'week' })} />
        <Tile label="No EDD yet" value={bands.none || 0} tone={bands.none ? 'text-warn-400' : 'text-success-400'} hint="Give the date on the task" active={band === 'none'} onClick={() => setFilter({ band: band === 'none' ? 'all' : 'none' })} />
        <Tile label="Needs assembly" value={teams.needsAssembly || 0} tone={teams.needsAssembly ? 'text-warn-400' : 'text-steel-50'} hint="Assembly not tasked yet" active={team === 'assembly'} onClick={() => setFilter({ team: team === 'assembly' ? 'all' : 'assembly' })} />
        <Tile label="Problems" value={teams.issues || 0} tone={teams.issues ? 'text-danger-400' : 'text-success-400'} hint="Mould, machine, material" active={team === 'issues'} onClick={() => setFilter({ team: team === 'issues' ? 'all' : 'issues' })} />
        <Tile label="Not picked up" value={teams.unclaimed || 0} tone={teams.unclaimed ? 'text-warn-400' : 'text-steel-50'} hint="Nobody on it yet" active={team === 'unclaimed'} onClick={() => setFilter({ team: team === 'unclaimed' ? 'all' : 'unclaimed' })} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[{ key: 'all', label: 'All' }, ...EDD_BANDS.map((entry) => ({ key: entry.key, label: BAND_LABEL[entry.key] })), { key: 'mine', label: 'Mine' }].map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setFilter(entry.key === 'all' ? { band: 'all', team: 'all' } : { band: entry.key })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${band === entry.key ? 'border-flame-500 bg-flame-500/10 text-flame-400' : 'border-line/[0.1] text-steel-400 hover:text-steel-200'}`}
          >
            {entry.label}{entry.key !== 'all' && entry.key !== 'mine' ? ` ${bands[entry.key] || 0}` : ''}
          </button>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line/[0.1] sm:block" aria-hidden />
        {TEAM_FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setFilter({ team: team === entry.key ? 'all' : entry.key })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${team === entry.key ? 'border-accent bg-accent/10 text-accent' : 'border-line/[0.1] text-steel-400 hover:text-steel-200'}`}
          >
            {entry.label}
          </button>
        ))}
        <input
          aria-label="Search enquiry, buyer, model or order"
          type="search"
          className="input ml-auto w-full sm:w-64"
          placeholder="Search enquiry, buyer, model, SO…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {shown.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-base font-semibold text-steel-200">{rows.length ? 'Nothing matches this filter.' : 'Nothing on the press right now.'}</p>
          <p className="mt-1 text-sm text-steel-500">{rows.length ? 'Pick another band or team, or clear the search.' : 'A Production task raised on an enquiry appears here, in EDD order.'}</p>
        </div>
      ) : (
        <>
          {/* The table, on a desk. */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-2.5 py-3 text-left">EDD</th>
                  <th className="px-2.5 py-3 text-left">Enquiry · buyer</th>
                  <th className="px-2.5 py-3 text-left">Model · qty</th>
                  <th className="px-2.5 py-3 text-left">Production</th>
                  <th className="px-2.5 py-3 text-left">Assembly</th>
                  <th className="px-2.5 py-3 text-left">Printing</th>
                  <th className="px-2.5 py-3 text-left">Quality</th>
                  <th className="px-2.5 py-3 text-left">Dispatch</th>
                  <th className="px-2.5 py-3 text-left">With</th>
                  <th className="min-w-[11rem] px-2.5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.task._id} className={`border-t border-line/10 align-top ${row.band === 'late' ? 'bg-danger-500/[0.05]' : row.task.issue ? 'bg-warn-500/[0.06]' : ''}`}>
                    <td className="whitespace-nowrap px-2.5 py-3">
                      <p className={`font-semibold ${row.band === 'late' ? 'text-danger-400' : 'text-steel-100'}`}>{row.edd ? formatDate(row.edd.date) : '—'}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_CHIP[row.band]}`}>{BAND_LABEL[row.band]}</span>
                    </td>
                    <td className="px-2.5 py-3">
                      <Link to={`/enquiries/${row.enquiry._id}`} className="font-semibold text-steel-50 hover:text-accent">{row.enquiry.number}</Link>
                      <p className="text-xs text-steel-300">{row.enquiry.customer?.name || '—'}</p>
                      <p className="text-xs text-steel-500">
                        {row.order?.number ? `${row.order.number} · ` : ''}{row.enquiry.owner?.name ? `${row.enquiry.owner.name}’s buyer` : ''}
                      </p>
                    </td>
                    <td className="px-2.5 py-3">
                      <p className="text-steel-100">{row.enquiry.model || '—'}</p>
                      <p className="text-xs text-steel-400">{[row.enquiry.quantity && `${Number(row.enquiry.quantity).toLocaleString('en-IN')} pcs`, row.enquiry.colour].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-2.5 py-3">
                      {mayWork(row) ? (
                        <select
                          aria-label={`Production status of ${row.enquiry.number}`}
                          className="input w-full min-w-[10rem] py-1.5 text-sm"
                          value={row.task.status || ''}
                          onChange={(event) => open(row, event.target.value)}
                        >
                          {!row.task.statusLabel && <option value="">Open</option>}
                          {statuses.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                        </select>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.task.issue ? 'bg-danger-500/15 text-danger-400' : 'bg-line/[0.08] text-steel-200'}`}>{row.task.statusLabel || 'Open'}</span>
                      )}
                      {row.task.latest?.note && (
                        <p className="mt-1 line-clamp-2 max-w-[12rem] text-xs text-steel-400" title={row.task.latest.note}>
                          {row.task.latest.by?.name ? `${row.task.latest.by.name}: ` : ''}{row.task.latest.note}
                        </p>
                      )}
                    </td>
                    <td className="px-2.5 py-3"><TeamCell team={row.teams.assembling} needed={row.needsAssembly} label="Assembly" /></td>
                    <td className="px-2.5 py-3"><TeamCell team={row.teams.printing} label="Printing" /></td>
                    <td className="px-2.5 py-3"><TeamCell team={row.teams.quality} label="Quality" /></td>
                    <td className="px-2.5 py-3"><TeamCell team={row.teams.despatch} label="Dispatch" /></td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-xs text-steel-300">
                      {row.task.with?.name || <span className="text-warn-400">not picked up</span>}
                      {row.task.dueDate && <p className={`text-xs ${row.task.late ? 'text-danger-400' : 'text-steel-500'}`}>due {formatDate(row.task.dueDate)}</p>}
                    </td>
                    <td className="px-2.5 py-3 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button type="button" className="row-action" onClick={() => open(row)}>{mayWork(row) ? 'Open / update' : 'Open'}</button>
                          {mayWork(row) && row.needsAssembly && !row.teams.assembling && (
                            <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setAssemblyFor(row)}>Task Assembly</button>
                          )}
                          {mayWork(row) && !row.needsAssembly && !row.teams.assembling && (
                            <button type="button" className="row-action" onClick={() => setAssemblyFor(row)}>Needs assembly</button>
                          )}
                        </div>
                        {mayWork(row) && problems.length > 0 && (
                          <select
                            aria-label={`Report a problem on ${row.enquiry.number}`}
                            className="input w-40 py-1 text-xs"
                            value=""
                            onChange={(event) => event.target.value && open(row, event.target.value)}
                          >
                            <option value="">Report a problem…</option>
                            {problems.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* The same rows, as cards on a phone. */}
          <ul className="space-y-3 md:hidden">
            {shown.map((row) => (
              <li key={row.task._id} className={`rounded-xl border p-3 ${row.band === 'late' ? 'border-danger-500/40 bg-danger-500/[0.05]' : 'border-line/10'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/enquiries/${row.enquiry._id}`} className="font-semibold text-steel-50">{row.enquiry.number}</Link>
                    <p className="truncate text-xs text-steel-300">{row.enquiry.customer?.name || '—'} · {row.enquiry.model || '—'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_CHIP[row.band]}`}>{row.edd ? formatDate(row.edd.date) : 'No EDD'}</span>
                </div>
                <p className="mt-1 text-xs text-steel-400">{row.task.statusLabel || 'Open'}{row.task.with?.name ? ` · ${row.task.with.name}` : ' · not picked up'}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {[['Assembly', row.teams.assembling, row.needsAssembly], ['Printing', row.teams.printing], ['Quality', row.teams.quality], ['Dispatch', row.teams.despatch]].map(([label, entry, needed]) => (
                    (entry || needed) && <span key={label} className="rounded-full bg-line/[0.08] px-2 py-0.5 text-steel-300">{label}: {entry ? entry.label : 'needed'}</span>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="row-action" onClick={() => open(row)}>{mayWork(row) ? 'Open / update' : 'Open'}</button>
                  {mayWork(row) && !row.teams.assembling && <button type="button" className="row-action" onClick={() => setAssemblyFor(row)}>{row.needsAssembly ? 'Task Assembly' : 'Needs assembly'}</button>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-xs text-steel-500">
        Read by every department. Production moves the status and reports problems from the row; the EDD is given on the task.
        {departments.includes('despatch') ? ' Dispatch: a row at Ready for Dispatch is yours to plan.' : ''}
        {departments.includes('assembling') ? ' Assembly: “Needed” on your column means the hanger needs you and nobody has tasked you yet — ask Production.' : ''}
      </p>

      {opened && (
        <TaskPanel
          task={opened.task}
          startWith={opened.status}
          mayWork={mayWork(opened.row)}
          onClose={() => setOpened(null)}
          onChanged={() => { setOpened(null); load(); }}
        />
      )}
      {assemblyFor && (
        <DepartmentTaskDialog
          enquiry={{ _id: assemblyFor.enquiry._id, customer: assemblyFor.enquiry.customer }}
          catalogue={catalogue}
          kind="ask_assembling_edd"
          fromTask={{ _id: assemblyFor.task._id, kind: 'ask_edd' }}
          title={`Task Assembly — ${assemblyFor.enquiry.number}`}
          onClose={() => setAssemblyFor(null)}
          onSent={() => { setAssemblyFor(null); load(); }}
        />
      )}
      {/* Which departments share this screen: said once, for whoever wonders who else reads it. */}
      <p className="sr-only">{['production', 'assembling', 'printing', 'quality', 'despatch'].map(departmentLabel).join(', ')}</p>
    </div>
  );
}
