import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { handoffs as handoffsApi, production as productionApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import TaskPanel from '../components/TaskPanel.jsx';
import DepartmentTaskDialog from '../components/DepartmentTaskDialog.jsx';
import { ErrorState, PageHeader, TableSkeleton } from '../components/ui.jsx';
import { formatDate, formatRelative } from '../utils/format.js';
import { departmentLabel } from '../utils/pipeline.js';
import { pathOf } from '../utils/edd.js';
import { todayInIndia } from '../utils/taskForm.js';
import { EDD_BANDS, boardOf, capacityWords, dayGroups, dueWords, pressTimeTight, queueCsv } from '../utils/productionQueue.js';

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
 *
 * Two ways to look at it: the list, cut into days with the EDD in words ("2 days late",
 * "tomorrow") and each row opening to its last few updates; and the board, Production's statuses
 * folded into five columns — new, planned, on the press, problems, off the press — for the
 * glance at the start of a shift. Printed or taken as a sheet for the floor's own board.
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

/**
 * What the floor is doing for the row now — the press and mould running, from the mould runs
 * [server: productionQueue `floor`] — and what its finished runs made.
 */
function Moulding({ floor }) {
  if (!floor) return null;
  const running = floor.running || [];
  const made = floor.made?.good || 0;
  if (!running.length && !made) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      {running.map((run) => (
        <p key={run._id} className="font-semibold text-success-400" title={`${run.number} since ${formatDate(run.startedAt)}`}>
          <span aria-hidden="true">● </span>{run.machine || 'Press'} · {run.mould || 'mould'} running
        </p>
      ))}
      {made > 0 && <p className="text-steel-400">{made.toLocaleString('en-IN')} made · {floor.made.runs} run{floor.made.runs === 1 ? '' : 's'}</p>}
    </div>
  );
}

/** The team filters beside the bands: who the row is waiting for. */
const TEAM_FILTERS = [
  { key: 'route', label: 'Printing / assembly to decide', test: (row) => !row.routing },
  { key: 'assembly', label: 'Needs assembly', test: (row) => row.needsAssembly },
  { key: 'quality', label: 'With Quality', test: (row) => row.teams.quality && !row.teams.quality.completed },
  { key: 'dispatch', label: 'Dispatch waiting', test: (row) => row.teams.despatch && !row.teams.despatch.completed },
  { key: 'issues', label: 'Problems', test: (row) => row.task.issue },
  { key: 'moulding', label: 'Moulding now', test: (row) => Boolean(row.floor?.running?.length) },
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

/** The row opened: the last few things written on the task, and what was asked. */
function RowDetail({ row }) {
  const recent = row.task.recent || [];
  const brief = row.task.brief || {};
  const asked = [['Model', brief.model || row.enquiry.model], ['Quantity', brief.quantity], ['Material / colour', brief.material || row.enquiry.colour], ['Assembly', !row.routing && (brief.assembly === true || brief.assembly === 'true' || brief.assembly === 'Yes') ? 'needed' : null]].filter(([, value]) => value);
  /* What Production decided follows moulding, model by model [components/TaskRouting.jsx]. */
  const paths = (row.routing?.models || []).map((entry) => [entry.model, pathOf(entry)]);
  return (
    <div className="grid gap-3 text-xs md:grid-cols-3">
      <div>
        <p className="font-semibold text-steel-300">Asked</p>
        <ul className="mt-1 space-y-0.5 text-steel-400">
          {asked.map(([label, value]) => <li key={label}>{label}: <span className="text-steel-200">{value}</span></li>)}
          {row.task.raisedBy?.name && <li>Raised by <span className="text-steel-200">{row.task.raisedBy.name}</span>{row.task.createdAt ? ` · ${formatRelative(row.task.createdAt)}` : ''}</li>}
          {row.order?.number && <li>SO <span className="text-steel-200">{row.order.number}</span></li>}
          {row.edd?.department && <li>EDD given by <span className="text-steel-200">{departmentLabel(row.edd.department)}</span></li>}
          {row.capacity?.days > 0 && <li>Press time <span className="text-steel-200">{capacityWords(row.capacity)}</span>{row.capacity.finish ? ` · done ${formatDate(row.capacity.finish)} if started today` : ''}</li>}
          {row.routing?.handOverDate && <li>Hand-over to the next team <span className="text-steel-200">{formatDate(row.routing.handOverDate)}</span></li>}
        </ul>
        <p className="mt-2 font-semibold text-steel-300">After moulding</p>
        {paths.length ? (
          <ul className="mt-1 space-y-0.5 text-steel-400">
            {paths.map(([model, path]) => <li key={model}>{model}: <span className="text-steel-200">{path}</span></li>)}
          </ul>
        ) : (
          <p className="mt-1 text-warn-400">Not decided yet — printing or assembly is decided on the task.</p>
        )}
      </div>
      <div className="md:col-span-2">
        <p className="font-semibold text-steel-300">Latest on the task</p>
        {recent.length === 0 ? (
          <p className="mt-1 text-steel-500">Nothing written on it yet.</p>
        ) : (
          <ol className="mt-1 space-y-1">
            {recent.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex gap-2">
                <span className="shrink-0 tabular-nums text-steel-500">{entry.at ? formatRelative(entry.at) : ''}</span>
                <span className="text-steel-200">{entry.by?.name ? `${entry.by.name}: ` : ''}{entry.note || entry.statusLabel || '—'}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** The board: five columns, the row as a card, the status moved from the card. */
function Board({ columns, statuses, mayWork, onMove, onOpen, onAssembly }) {
  return (
    <div className="grid gap-3 md:grid-cols-5" data-board>
      {columns.map((column) => (
        <section key={column.key} className={`rounded-xl border-t-4 bg-line/[0.02] p-2 ${column.tone}`} aria-label={column.label}>
          <p className="px-1 pb-2 text-xs font-bold uppercase tracking-[0.06em] text-steel-300">
            {column.label} <span className="font-normal normal-case tracking-normal text-steel-500">· {column.rows.length}</span>
          </p>
          <ul className="space-y-2">
            {column.rows.length === 0 && <li className="px-1 py-3 text-center text-xs text-steel-600">—</li>}
            {column.rows.map((row) => (
              <li key={row.task._id} className={`rounded-lg border bg-ink-900/40 p-2.5 ${row.band === 'late' ? 'border-danger-500/40' : 'border-line/[0.1]'}`}>
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/enquiries/${row.enquiry._id}`} className="text-sm font-semibold text-steel-50 hover:text-accent">{row.enquiry.number}</Link>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold ${BAND_CHIP[row.band]}`}>{dueWords(row.edd?.date)}</span>
                </div>
                <p className="truncate text-xs text-steel-300">{row.enquiry.customer?.name || '—'}</p>
                <p className="text-xs text-steel-400">{row.enquiry.model || '—'}{row.enquiry.quantity ? ` · ${Number(row.enquiry.quantity).toLocaleString('en-IN')} pcs` : ''}</p>
                <Moulding floor={row.floor} />
                {mayWork(row) ? (
                  <select
                    aria-label={`Production status of ${row.enquiry.number}`}
                    className="input mt-2 w-full py-1 text-xs"
                    value={row.task.status || ''}
                    onChange={(event) => onMove(row, event.target.value)}
                  >
                    {!row.task.statusLabel && <option value="">Open</option>}
                    {statuses.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                  </select>
                ) : (
                  <p className="mt-1 text-xs font-semibold text-steel-200">{row.task.statusLabel || 'Open'}</p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
                  {[['Assembly', row.teams.assembling, row.needsAssembly], ['Printing', row.teams.printing], ['Quality', row.teams.quality], ['Dispatch', row.teams.despatch]].map(([label, entry, needed]) => (
                    (entry || needed) && (
                      <span key={label} className={`rounded-full px-1.5 py-0.5 ${entry?.completed ? 'bg-success-500/15 text-success-400' : entry ? 'bg-accent/15 text-accent' : 'bg-warn-500/15 text-warn-400'}`}>
                        {label}: {entry ? entry.label : 'needed'}
                      </span>
                    )
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                  <span className={`min-w-0 truncate ${row.task.with ? 'text-steel-400' : 'text-warn-400'}`}>{row.task.with?.name || 'not picked up'}</span>
                  <span className="flex shrink-0 gap-2">
                    <button type="button" className="row-action" onClick={() => onOpen(row)}>Open</button>
                    {mayWork(row) && !row.teams.assembling && <button type="button" className="row-action" onClick={() => onAssembly(row)}>{row.needsAssembly ? 'Task Assembly' : 'Assembly'}</button>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
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
  const view = params.get('view') === 'board' ? 'board' : 'list';
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleRow = (id) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const setFilter = (next) => {
    const merged = { band, team, view: view === 'board' ? 'board' : '', ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, value]) => value && value !== 'all')), { replace: true });
  };
  /* The queue as a sheet, for the floor's own board or a supplier's WhatsApp. */
  const download = () => {
    const blob = new Blob([queueCsv(shown)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `production-queue-${todayInIndia()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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
          <div className="flex flex-wrap gap-2 print:hidden">
            <div className="inline-flex rounded-lg border border-line/[0.12] p-0.5" role="group" aria-label="View">
              {[['list', 'List'], ['board', 'Board']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => setFilter({ view: key === 'board' ? 'board' : '' })}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === key ? 'bg-flame-500/15 text-flame-400' : 'text-steel-400 hover:text-steel-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {worksProduction && <Link to="/departments/production" className="btn-secondary">Production desk</Link>}
            <Link to="/production" className="btn-secondary">Production status</Link>
            <button type="button" className="btn-secondary" onClick={() => window.print()}>Print</button>
            <button type="button" className="btn-secondary" onClick={download}>CSV</button>
            <button type="button" className="btn-secondary" onClick={load}>Refresh</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 print:hidden md:grid-cols-4 xl:grid-cols-8">
        <Tile label="Late" value={bands.late || 0} tone={bands.late ? 'text-danger-400' : 'text-success-400'} hint="Past the EDD" active={band === 'late'} onClick={() => setFilter({ band: band === 'late' ? 'all' : 'late' })} />
        <Tile label="Due today" value={bands.today || 0} tone={bands.today ? 'text-warn-400' : 'text-steel-50'} hint="EDD is today" active={band === 'today'} onClick={() => setFilter({ band: band === 'today' ? 'all' : 'today' })} />
        <Tile label="Due tomorrow" value={teams.dueTomorrow || 0} hint="Ready for Dispatch by tonight" active={false} onClick={() => setFilter({ band: 'week' })} />
        <Tile label="No EDD yet" value={bands.none || 0} tone={bands.none ? 'text-warn-400' : 'text-success-400'} hint="Give the date on the task" active={band === 'none'} onClick={() => setFilter({ band: band === 'none' ? 'all' : 'none' })} />
        <Tile label="Printing / assembly?" value={teams.toRoute || 0} tone={teams.toRoute ? 'text-warn-400' : 'text-success-400'} hint="Not decided on the task yet" active={team === 'route'} onClick={() => setFilter({ team: team === 'route' ? 'all' : 'route' })} />
        <Tile label="Moulding now" value={teams.moulding || 0} tone={teams.moulding ? 'text-success-400' : 'text-steel-50'} hint="A mould running on a press for it" active={team === 'moulding'} onClick={() => setFilter({ team: team === 'moulding' ? 'all' : 'moulding' })} />
        <Tile label="Problems" value={teams.issues || 0} tone={teams.issues ? 'text-danger-400' : 'text-success-400'} hint="Mould, machine, material" active={team === 'issues'} onClick={() => setFilter({ team: team === 'issues' ? 'all' : 'issues' })} />
        <Tile label="Not picked up" value={teams.unclaimed || 0} tone={teams.unclaimed ? 'text-warn-400' : 'text-steel-50'} hint="Nobody on it yet" active={team === 'unclaimed'} onClick={() => setFilter({ team: team === 'unclaimed' ? 'all' : 'unclaimed' })} />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
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
      ) : view === 'board' ? (
        <Board columns={boardOf(shown)} statuses={statuses} mayWork={mayWork} onMove={open} onOpen={(row) => open(row)} onAssembly={setAssemblyFor} />
      ) : (
        <>
          {/* The table, on a desk. */}
          <div className="card hidden overflow-x-auto md:block print:block print:overflow-visible">
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
              {dayGroups(shown).map((group) => (
              <tbody key={group.key}>
                {/* The day, as a shift reads it: everything late first, then each EDD day by name. */}
                <tr className="border-t border-line/10 bg-line/[0.03]">
                  <th scope="rowgroup" colSpan={10} className={`px-2.5 py-1.5 text-left text-xs font-bold uppercase tracking-[0.06em] ${group.tone}`}>
                    {group.label} <span className="font-normal normal-case tracking-normal text-steel-500">· {group.rows.length}</span>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <Fragment key={row.task._id}>
                  <tr className={`border-t border-line/10 align-top ${row.band === 'late' ? 'bg-danger-500/[0.05]' : row.task.issue ? 'bg-warn-500/[0.06]' : ''}`}>
                    <td className="whitespace-nowrap px-2.5 py-3">
                      <div className="flex items-start gap-1">
                        <button
                          type="button"
                          className="print:hidden -ml-1 mt-0.5 rounded px-1 text-xs text-steel-500 hover:text-steel-200"
                          aria-expanded={expanded.has(row.task._id)}
                          aria-label={`${expanded.has(row.task._id) ? 'Hide' : 'Show'} the updates on ${row.enquiry.number}`}
                          onClick={() => toggleRow(row.task._id)}
                        >
                          {expanded.has(row.task._id) ? '▾' : '▸'}
                        </button>
                        <div>
                          <p className={`font-semibold ${row.band === 'late' ? 'text-danger-400' : 'text-steel-100'}`}>{row.edd ? formatDate(row.edd.date) : '—'}</p>
                          <p className={`text-xs ${row.band === 'late' ? 'text-danger-400' : row.band === 'today' ? 'text-warn-400' : 'text-steel-500'}`}>{dueWords(row.edd?.date)}</p>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_CHIP[row.band]}`}>{BAND_LABEL[row.band]}</span>
                          {capacityWords(row.capacity) && (
                            <p className={`mt-1 text-xs ${pressTimeTight(row) ? 'font-semibold text-warn-400' : 'text-steel-500'}`} title={pressTimeTight(row) ? 'Started today, the press time ends after the EDD' : undefined}>
                              {capacityWords(row.capacity)}{pressTimeTight(row) ? ' — past the EDD' : ''}
                            </p>
                          )}
                        </div>
                      </div>
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
                      <Moulding floor={row.floor} />
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
                  {expanded.has(row.task._id) && (
                    <tr className="bg-line/[0.02]">
                      <td colSpan={10} className="px-4 pb-3 pt-1">
                        <RowDetail row={row} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
              ))}
            </table>
          </div>

          {/* The same rows, as cards on a phone. */}
          <ul className="space-y-3 md:hidden print:hidden">
            {shown.map((row) => (
              <li key={row.task._id} className={`rounded-xl border p-3 ${row.band === 'late' ? 'border-danger-500/40 bg-danger-500/[0.05]' : 'border-line/10'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/enquiries/${row.enquiry._id}`} className="font-semibold text-steel-50">{row.enquiry.number}</Link>
                    <p className="truncate text-xs text-steel-300">{row.enquiry.customer?.name || '—'} · {row.enquiry.model || '—'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${BAND_CHIP[row.band]}`}>{row.edd ? `${formatDate(row.edd.date)} · ${dueWords(row.edd.date)}` : 'No EDD'}</span>
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
