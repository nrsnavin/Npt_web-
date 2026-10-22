import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import TaskPanel from './TaskPanel.jsx';
import { BAND_TONE, QcChip, RISK_TONE, RiskChips } from './ProductionQueueList.jsx';
import { ErrorState, TableSkeleton } from './ui.jsx';
import { formatDate, formatRelative } from '../utils/format.js';
import { EDD_BANDS, dueWords } from '../utils/productionQueue.js';

/**
 * Printing's and Assembly's queues, read at a glance [server: finishingQueue.controller]: one
 * line per open task in the order the goods are due — the date the team works to (its own hand-
 * over date or EDD once given, the enquiry's EDD until then), whose it is, where the goods are
 * model by model (still with Production or Printing and due when, or in hand since when), and
 * the state in at most thirty words. The row opens the task to move its statuses and give its
 * date, or the enquiry's Production workflow page where every team's hand-over is seen whole.
 *
 * The queue opens on the goods in hand — what the team can work now — with what is still on the
 * press one tap away, so a model not yet come is never taken for one waiting on this team.
 */

const REFRESH_MS = 60 * 1000;
export const TEAM_WORDS = {
  printing: { label: 'Printing', queue: 'Printing queue', from: 'Production', verb: 'print' },
  assembling: { label: 'Assembly', queue: 'Assembly queue', from: 'Production or Printing', verb: 'assemble' },
};

/*
 * The goods: in hand (any model has come), or still with the team before. The desk opens on
 * what is in hand; the choice is kept per team.
 */
const STAGES = [
  { key: 'in_hand', label: 'Goods in hand', count: (meta) => meta?.goods?.inHand },
  { key: 'waiting', label: 'Still to come', count: (meta) => meta?.goods?.waiting },
  { key: 'all', label: 'Both', count: (meta, rows) => rows.length },
];
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
        <span className="text-steel-400">from {entry.fromLabel} {formatDate(came)}</span>
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
  const mayWork = (task) => isAdmin || departments.includes(task.department) || String(task.user?._id || task.user || '') === me;
  const setStage = (next) => {
    setStageState(next);
    try { window.localStorage.setItem(stageKey(team, compact), next); } catch { /* a private window */ }
  };

  const load = useCallback(() => productionApi.teamQueue(team)
    .then((reply) => { setRows(reply.data || []); setMeta(reply.meta || null); setAsOf(new Date()); setError(null); onRows?.(reply.data || []); })
    .catch((failure) => setError(failure)), [team, onRows]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || []).filter((row) => {
      if (stage === 'in_hand' && !row.goods?.inHand) return false;
      if (stage === 'waiting' && row.goods?.inHand) return false;
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
  const hiddenByStage = stage === 'in_hand' ? rows.filter((row) => !row.goods?.inHand).length
    : stage === 'waiting' ? rows.filter((row) => row.goods?.inHand).length : 0;
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
          <span className="text-steel-300">— {stage === 'in_hand' ? `the goods are still with ${words.from}` : 'the goods are already in hand'}.</span>
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
              : stage === 'in_hand' && !search && band === 'all' ? `No goods in hand yet — they are still with ${words.from}.`
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
              <li key={row.task._id} className={`card border-l-4 ${riskTone ? riskTone.edge : tone.edge} p-3 sm:p-4`}>
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
                      {goods.all ? 'Goods in hand' : goods.inHand ? `${goods.received} of ${goods.total} models in hand` : goods.expected ? `Due ${dueWords(goods.expected)}` : `Still with ${(goods.from || []).map((key) => (key === 'printing' ? 'Printing' : 'Production')).join(' and ') || words.from}`}
                    </span>
                  </div>
                  {/* Where it stands: the thirty words, then each model. */}
                  <div className="min-w-0 space-y-1.5">
                    {(riskTone && row.risk?.why) || row.qc?.required ? (
                      <p className="flex flex-wrap items-center gap-1.5 text-xs">
                        {riskTone && row.risk?.why && <span className={`rounded-full px-2 py-0.5 font-semibold ${riskTone.chip}`}>{riskTone.label}</span>}
                        {riskTone && row.risk?.why && <span className="text-steel-300">{row.risk.why}</span>}
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
                    <button type="button" className="btn-primary justify-center px-3 py-2 text-sm" onClick={() => setOpened(row.task)}>
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
