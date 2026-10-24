import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi, workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import TaskPanel from './TaskPanel.jsx';
import { BAND_TONE, QcChip, RISK_TONE, RiskChips } from './ProductionQueueList.jsx';
import { ErrorState, TableSkeleton } from './ui.jsx';
import { formatDate, formatRelative } from '../utils/format.js';
import { EDD_BANDS, dueWords } from '../utils/productionQueue.js';
import { DELIVERY_TONE, DeliveryBadge, inDanger } from './DeliveryRisk.jsx';

/**
 * Printing's and Assembly's queues, read at a glance [server: finishingQueue.controller]: one
 * line per open task in the order the goods are due — the date the team works to (its own hand-
 * over date or EDD once given, the enquiry's EDD until then), whose it is, where the goods are
 * model by model (still with Production or Printing and due when, or in hand since when), and
 * the state in at most thirty words. The row opens the task to move its statuses and give its
 * date, or the enquiry's Production workflow page where every team's hand-over is seen whole.
 *
 * The goods stand at one of three, model by model [server: finishingQueue.controller `goods`]:
 * still to come (with Production or Printing), Goods received — handed over, or recorded here —
 * waiting to be taken on with "Add to work queue" [server: handoff.service `addToWorkQueue`], and
 * in the work queue, being worked. The desk shows each, so a model not yet come is never taken
 * for one waiting on this team, and goods that came are never left unseen.
 */

const REFRESH_MS = 60 * 1000;
export const TEAM_WORDS = {
  printing: { label: 'Printing', queue: 'Printing queue', from: 'Production', verb: 'print' },
  assembling: { label: 'Assembly', queue: 'Assembly queue', from: 'Production or Printing', verb: 'assemble' },
};

/*
 * Where the goods are: received and waiting to be taken on, in the work queue, or still with the
 * team before [server: row `goods.stage`]. The choice is kept per team.
 */
const STAGES = [
  { key: 'received', label: 'Goods received', count: (meta) => meta?.goods?.received },
  { key: 'in_queue', label: 'Work queue', count: (meta) => meta?.goods?.inQueue },
  { key: 'to_come', label: 'Still to come', count: (meta) => meta?.goods?.toCome },
  { key: 'all', label: 'All', count: (meta, rows) => rows.length },
];
const STAGE_HIDDEN = {
  received: 'they are in the work queue or still to come',
  in_queue: 'their goods are still to come or waiting to be added to the work queue',
  to_come: 'their goods have already come',
};
const stageKey = (team, compact) => `npt.finishingStage.${team}.${compact ? 'desk' : 'queue'}`;
const keptStage = (team, compact) => {
  try {
    const kept = window.localStorage.getItem(stageKey(team, compact));
    if (STAGES.some((entry) => entry.key === kept)) return kept;
  } catch { /* a private window */ }
  return 'all';
};

/** One model's line: where the goods are and where this team has got to. */
function ModelLine({ entry }) {
  const came = entry.received;
  const tone = entry.status?.issue ? 'text-danger-400' : entry.status?.ready || entry.handed ? 'text-success-400' : 'text-steel-200';
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      <span className="font-semibold text-steel-100">{entry.model}</span>
      {came ? (
        <span className={entry.goods === 'received' ? 'rounded bg-accent/15 px-1.5 py-px font-semibold text-accent' : 'text-steel-400'}>
          {entry.goods === 'received' ? `Received from ${entry.fromLabel} ${formatDate(came)} — add to work queue` : `In work queue · from ${entry.fromLabel} ${formatDate(came)}`}
        </span>
      ) : (
        <span className="rounded bg-warn-500/15 px-1.5 py-px font-semibold text-warn-400" title={entry.before?.label ? `${entry.fromLabel}: ${entry.before.label}` : undefined}>
          with {entry.fromLabel}{entry.expected ? ` · due ${formatDate(entry.expected)}` : ' · no date'}
        </span>
      )}
      <span className={tone}>{entry.handed ? 'Handed to Assembly' : entry.status?.label || 'Asked'}</span>
      {entry.given && <span className="text-steel-500">{entry.givenLabel} {formatDate(entry.given)}</span>}
      {entry.next && !entry.handed && <span className="text-steel-500">→ Assembly</span>}
    </li>
  );
}

export default function FinishingQueueList({ team, compact = false, onRows, onChanged }) {
  const words = TEAM_WORDS[team] || TEAM_WORDS.printing;
  const { isAdmin, departments = [], user } = useAuth();
  const me = String(user?.id || user?._id || '');
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [asOf, setAsOf] = useState(null);
  const [band, setBand] = useState('all');
  const [risk, setRisk] = useState('all');
  const [search, setSearch] = useState('');
  const [stage, setStageState] = useState(() => keptStage(team, compact));
  const [opened, setOpened] = useState(null);
  const [queuing, setQueuing] = useState(null);
  const [queueProblem, setQueueProblem] = useState(null);
  const mayWork = (task) => isAdmin || departments.includes(task.department) || String(task.user?._id || task.user || '') === me;
  const setStage = (next) => {
    setStageState(next);
    try { window.localStorage.setItem(stageKey(team, compact), next); } catch { /* a private window */ }
  };

  const load = useCallback(() => productionApi.teamQueue(team)
    .then((reply) => { setRows(reply.data || []); setMeta(reply.meta || null); setAsOf(new Date()); setError(null); onRows?.(reply.data || []); })
    .catch((failure) => setError(failure)), [team, onRows]);
  useEffect(() => { load(); }, [load]);
  /* Goods received → the work queue: every model in hand on the row that is not in it yet. */
  const addToWorkQueue = async (row) => {
    setQueuing(row.task._id);
    setQueueProblem(null);
    try {
      await workspace.todos.workQueue({ id: row.task._id, models: row.goods?.toQueue || [] });
      await load();
      onChanged?.();
    } catch (failure) {
      setQueueProblem({ id: row.task._id, message: failure.message });
    } finally {
      setQueuing(null);
    }
  };
  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || []).filter((row) => {
      if (stage !== 'all' && row.goods?.stage !== stage) return false;
      if (band === 'problems' && !row.task.issue) return false;
      if (!['all', 'problems'].includes(band) && row.band !== band) return false;
      if (risk !== 'all' && row.risk?.level !== risk) return false;
      if (!term) return true;
      return [row.enquiry.number || 'Team task', row.enquiry.customer?.name, row.order?.number, ...(row.models || []).map((entry) => entry.model)]
        .filter(Boolean).some((text) => String(text).toLowerCase().includes(term));
    });
  }, [rows, band, risk, search, stage]);

  if (error && !rows) return <ErrorState error={error} onRetry={load} />;
  if (!rows) return <TableSkeleton rows={6} columns={4} />;

  const bands = meta?.bands || {};
  const hiddenByStage = stage === 'all' ? 0 : rows.filter((row) => row.goods?.stage !== stage).length;
  const chips = [
    { key: 'all', label: 'All', count: rows.length },
    ...EDD_BANDS.map((entry) => ({ key: entry.key, label: BAND_TONE[entry.key]?.label || entry.label, count: bands[entry.key] || 0 })),
    { key: 'problems', label: 'Problems', count: meta?.issues || 0 },
  ];

  return (
    <section className="space-y-3" aria-label={words.queue}>
      <div className="flex flex-wrap gap-1 rounded-xl border border-line/[0.06] bg-line/[0.02] p-1 print:hidden" role="group" aria-label="Where the goods are">
        {STAGES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={stage === entry.key}
            onClick={() => setStage(entry.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${stage === entry.key ? 'fill-primary shadow' : 'text-steel-300 hover:bg-line/[0.06]'}`}
          >
            {entry.label} <span className="tabular-nums opacity-75">{entry.count(meta, rows) ?? 0}</span>
          </button>
        ))}
      </div>
      {/* A kept choice that hides tasks says so. */}
      {stage !== 'all' && hiddenByStage > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-warn-500/40 bg-warn-500/[0.07] px-3 py-2 text-sm text-steel-100 print:hidden" role="status">
          <span className="font-semibold text-warn-400">{hiddenByStage} task{hiddenByStage > 1 ? 's are' : ' is'} not shown by this filter</span>
          <span className="text-steel-300">— {STAGE_HIDDEN[stage]}.</span>
          <button type="button" className="row-action" onClick={() => setStage('all')}>Show all</button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {chips.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={band === entry.key}
            onClick={() => setBand(entry.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${band === entry.key ? 'border-flame-500 bg-flame-500/10 text-flame-400' : 'border-line/[0.1] text-steel-400 hover:text-steel-200'}`}
          >
            {entry.label} <span className="tabular-nums opacity-75">{entry.count}</span>
          </button>
        ))}
        <input
          aria-label="Search enquiry, buyer, model or SO"
          type="search"
          className="input ml-auto w-full sm:w-64"
          placeholder="Search enquiry, buyer, model, SO…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {/* The same four colours as the production queue, against the date this team works to. */}
      <RiskChips value={risk} onChange={setRisk} counts={meta?.risk} />

      {shown.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-base font-semibold text-steel-200">
            {!rows.length ? `Nothing to ${words.verb} right now.`
              : stage === 'received' && !search && band === 'all' ? 'No goods waiting to be taken on — nothing new has come.'
                : stage === 'in_queue' && !search && band === 'all' ? 'Nothing in the work queue — add the goods received to it.'
                : 'Nothing matches this filter.'}
          </p>
          <p className="mt-1 text-sm text-steel-500">
            {rows.length ? 'Pick another, or clear the search.' : `When Production routes a model to ${words.label}, its task appears here in EDD order.`}
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {shown.map((row) => {
            const tone = BAND_TONE[row.band] || BAND_TONE.later;
            const riskTone = RISK_TONE[row.risk?.level] || null;
            const goods = row.goods || {};
            return (
              <li key={row.task._id} className={`card border-l-4 ${inDanger(row.delivery) ? DELIVERY_TONE[row.delivery.level].left : riskTone ? riskTone.edge : tone.edge} p-3 sm:p-4`}>
                <div className="grid gap-3 md:grid-cols-[8.5rem_minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center">
                  {/* The date the team works to. */}
                  <div className="flex items-center gap-2 md:block">
                    <p className={`text-base font-bold tabular-nums ${row.band === 'late' ? 'text-danger-400' : 'text-steel-50'}`}>{row.edd ? formatDate(row.edd.date) : 'No EDD'}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone.chip}`}>{row.edd ? dueWords(row.edd.date) : 'give the date'}</span>
                    {row.edd && (
                      <p className="mt-0.5 text-xs text-steel-500">{row.edd.source === 'team' ? `Your ${row.edd.label.toLowerCase()}` : 'Enquiry EDD'}</p>
                    )}
                  </div>
                  {/* Whose it is, and the goods. */}
                  <div className="min-w-0">
                    {row.enquiry.team
                      ? <p className="font-bold text-steel-50">Team task{row.task.raisedBy?.name ? <span className="font-normal text-steel-400"> · {row.task.raisedBy.name}</span> : null}</p>
                      : <Link to={`/enquiries/${row.enquiry._id}`} className="font-bold text-steel-50 hover:text-accent">{row.enquiry.number}</Link>}
                    <p className="truncate text-sm text-steel-300">{row.enquiry.customer?.name || '—'}</p>
                    <p className="truncate text-xs text-steel-500">{(row.models || []).map((entry) => entry.model).join(', ') || row.enquiry.model || '—'}{row.order?.number ? ` · ${row.order.number}` : ''}</p>
                    <span
                      className={`mt-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-semibold ${goods.all ? 'bg-success-500/15 text-success-400' : goods.inHand ? 'bg-accent/15 text-accent' : 'bg-warn-500/15 text-warn-400'}`}
                      title={goods.expected ? `Due from ${words.from} ${formatDate(goods.expected)}` : undefined}
                    >
                      {goods.stage === 'received' ? `Goods received — ${goods.toQueue?.length || 0} to add to the work queue`
                        : goods.stage === 'in_queue' ? (goods.all ? 'In work queue' : `In work queue · ${goods.received} of ${goods.total} models in hand`)
                          : goods.expected ? `Due ${dueWords(goods.expected)}` : `Still with ${(goods.from || []).map((key) => (key === 'printing' ? 'Printing' : 'Production')).join(' and ') || words.from}`}
                    </span>
                  </div>
                  {/* Where it stands: the thirty words, then each model. */}
                  <div className="min-w-0 space-y-1.5">
                    {(riskTone && row.risk?.why) || row.qc?.required || inDanger(row.delivery) ? (
                      <p className="flex flex-wrap items-center gap-1.5 text-xs">
                        {/* The press-days reading, unless the whole-order reading below already says the order is in danger. */}
                        {riskTone && row.risk?.why && !inDanger(row.delivery) && <span className={`rounded-full px-2 py-0.5 font-semibold ${riskTone.chip}`}>{riskTone.label}</span>}
                        {riskTone && row.risk?.why && !inDanger(row.delivery) && <span className="text-steel-300">{row.risk.why}</span>}
                        {/* The whole order against marketing's EDD, every model and team counted [server: deliveryRisk.service]. */}
                        {inDanger(row.delivery) && <DeliveryBadge risk={row.delivery} />}
                        {inDanger(row.delivery) && <span className="text-steel-300">{row.delivery.why}</span>}
                        <QcChip qc={row.qc} />
                      </p>
                    ) : null}
                    <p className={`text-sm leading-snug ${row.task.issue ? 'font-semibold text-danger-400' : 'text-steel-200'}`}>{row.summary}</p>
                    {row.models?.length > 0 && (
                      <ul className="space-y-0.5" aria-label="Models">
                        {row.models.map((entry) => <ModelLine key={entry.model} entry={entry} />)}
                      </ul>
                    )}
                    {row.task.latest?.note && (
                      <p className="truncate text-xs text-steel-500">{row.task.latest.by?.name ? `${row.task.latest.by.name}: ` : ''}{row.task.latest.note}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 print:hidden">
                    {/* Goods that came: taken into the work queue here, in one tap. */}
                    {mayWork(row.task) && goods.toQueue?.length > 0 && (
                      <button type="button" className="btn-primary justify-center px-3 py-2 text-sm" disabled={queuing === row.task._id} onClick={() => addToWorkQueue(row)}>
                        {queuing === row.task._id ? 'Adding…' : `Add to work queue${goods.toQueue.length > 1 ? ` (${goods.toQueue.length})` : ''}`}
                      </button>
                    )}
                    {queueProblem?.id === row.task._id && <p className="max-w-[12rem] text-xs text-danger-400" role="alert">{queueProblem.message}</p>}
                    <button type="button" className={`${mayWork(row.task) && goods.toQueue?.length > 0 ? 'btn-secondary' : 'btn-primary'} justify-center px-3 py-2 text-sm`} onClick={() => setOpened(row.task)}>
                      {mayWork(row.task) ? 'Update' : 'Open'}
                    </button>
                    {row.link && <Link to={row.link} className="btn-secondary justify-center px-3 py-2 text-sm">Workflow →</Link>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {opened && (
        <TaskPanel
          task={opened}
          mayWork={mayWork(opened)}
          onClose={() => setOpened(null)}
          onChanged={() => { setOpened(null); load(); onChanged?.(); }}
        />
      )}

      {!compact && (
        <p className="text-xs text-steel-500">
          {rows.length} open{asOf ? ` · as of ${formatRelative(asOf)}` : ''} · statuses and the {team === 'printing' ? 'hand-over date or EDD' : 'EDD'} are given on the task; every team’s hand-over is seen on the enquiry’s workflow page.
        </p>
      )}
    </section>
  );
}
