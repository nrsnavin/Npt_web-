import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi, workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import AddToProductionQueue from './AddToProductionQueue.jsx';
import ProductionInChargeLine from './ProductionInChargeLine.jsx';
import { ErrorState, Field, Modal, Notice, TableSkeleton } from './ui.jsx';
import { formatDate, formatRelative } from '../utils/format.js';
import { EDD_BANDS, dueWords } from '../utils/productionQueue.js';
import { WORK_ORDER_STATUS } from '../utils/workOrders.js';

/**
 * The production queue, read at a glance [server: productionQueue.controller]: one line per
 * enquiry in EDD order — when it is due, whose it is, its state in at most thirty words, and its
 * work orders. Nothing is changed here: every status, hand-over and date is given on the
 * enquiry's Production workflow page [pages/ProductionWorkflow.jsx], which each line opens.
 */

const REFRESH_MS = 60 * 1000;

/**
 * Admin takes a Production task off the desk — in the production queue or not yet: raised twice,
 * raised by mistake, an order the buyer dropped. It is closed with the reason [server:
 * handoff.service `closeByAdmin`], so it leaves the queue and the desk while the record and its
 * history stay; nothing goes on to Printing, Assembly or Dispatch.
 */
function DeleteTaskDialog({ row, onClose, onDeleted }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await workspace.todos.adminClose({ id: row.task._id, reason });
      onDeleted();
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const what = [row.enquiry.number || 'Team task', row.enquiry.customer?.name, row.enquiry.model].filter(Boolean).join(' · ');
  return (
    <Modal open title="Delete this Production task?" description={what} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-steel-300">
          It leaves the production queue and the Production desk{row.production?.taken ? ', though it was in the queue' : ''}. Nothing goes on to
          Printing, Assembly or Dispatch, and the enquiry stays where it is. Production is told why; the record and its history are kept.
        </p>
        <Field label="Why it is being deleted" required hint="For example: raised twice, raised by mistake, the buyer dropped the order">
          <textarea rows={3} className="input" value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-danger" disabled={busy || reason.trim().length < 5}>{busy ? 'Deleting…' : 'Delete task'}</button>
        </div>
      </form>
    </Modal>
  );
}

/*
 * In the production queue yet [server: productionSummary.service `productionTaken`] — Production
 * added it (planned, printing and assembly decided), or, for work begun before that step, a work
 * order, a press moulding it, or Production Started. The desk opens on what is still to be added,
 * so planning the next job is one look; the queue page opens on what is in it. The choice is kept.
 */
const STAGES = [
  { key: 'not_taken', label: 'Not in the production queue', count: (meta) => meta?.teams?.notTaken },
  { key: 'in_production', label: 'In the production queue', count: (meta) => meta?.teams?.inProduction },
  { key: 'all', label: 'Both', count: (meta, rows) => rows.length },
];
const stageKey = (compact) => `npt.productionStage.${compact ? 'desk' : 'queue'}`;
const keptStage = (compact) => {
  try {
    const kept = window.localStorage.getItem(stageKey(compact));
    if (STAGES.some((entry) => entry.key === kept)) return kept;
  } catch { /* a private window */ }
  return compact ? 'not_taken' : 'in_production';
};

export const BAND_TONE = {
  late: { edge: 'border-l-danger-500', chip: 'bg-danger-500/15 text-danger-400', label: 'Late' },
  today: { edge: 'border-l-warn-500', chip: 'bg-warn-500/15 text-warn-400', label: 'Today' },
  week: { edge: 'border-l-accent', chip: 'bg-accent/15 text-accent', label: 'This week' },
  later: { edge: 'border-l-line/20', chip: 'bg-line/[0.08] text-steel-300', label: 'Later' },
  none: { edge: 'border-l-warn-500/60', chip: 'bg-warn-500/15 text-warn-400', label: 'No EDD' },
};

/** A work order as a small chip: its number, status and how much is made. */
export function WorkOrderChip({ wo, orderId }) {
  const status = WORK_ORDER_STATUS[wo.status] || { label: wo.status };
  const done = wo.quantity ? Math.min(100, Math.round(((wo.goodQty || 0) / wo.quantity) * 100)) : 0;
  const body = (
    <>
      <span className="font-semibold text-steel-100">{wo.number}</span>
      <span className="text-steel-400">{wo.modelNumber ? ` · ${wo.modelNumber}` : ''} · {status.label}{wo.quantity ? ` · ${done}%` : ''}</span>
    </>
  );
  const tone = 'inline-flex items-center gap-1 rounded-md border border-line/[0.1] bg-line/[0.03] px-2 py-0.5 text-xs';
  return orderId
    ? <Link to={`/work-orders?order=${orderId}`} className={`${tone} hover:border-accent/50`} title="Open the work orders for this order">{body}</Link>
    : <span className={tone}>{body}</span>;
}

export default function ProductionQueueList({ compact = false, onRows }) {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [asOf, setAsOf] = useState(null);
  const [band, setBand] = useState('all');
  const [search, setSearch] = useState('');
  const [stage, setStageState] = useState(() => keptStage(compact));
  const [adding, setAdding] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { isAdmin, mayPlanProduction } = useAuth();
  /* Production plans its own press; Admin may too. */
  /* Adding to the queue routes, plans and dates the task: the Production in charge's (or Admin's) to do. */
  const mayPlan = mayPlanProduction;
  const setStage = (next) => {
    setStageState(next);
    try { window.localStorage.setItem(stageKey(compact), next); } catch { /* a private window */ }
  };

  const load = useCallback(() => productionApi.queue()
    .then((reply) => { setRows(reply.data || []); setMeta(reply.meta || null); setAsOf(new Date()); setError(null); onRows?.(reply.data || []); })
    .catch((failure) => setError(failure)), [onRows]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rows || []).filter((row) => {
      if (stage === 'not_taken' && row.production?.taken) return false;
      if (stage === 'in_production' && !row.production?.taken) return false;
      if (band === 'problems' && !row.task.issue) return false;
      if (!['all', 'problems'].includes(band) && row.band !== band) return false;
      if (!term) return true;
      return [row.enquiry.number || 'Team task', row.enquiry.customer?.name, row.order?.number, ...(row.models || []).map((entry) => entry.model)]
        .filter(Boolean).some((text) => String(text).toLowerCase().includes(term));
    });
  }, [rows, band, search, stage]);

  if (error && !rows) return <ErrorState error={error} onRetry={load} />;
  if (!rows) return <TableSkeleton rows={6} columns={4} />;

  const bands = meta?.bands || {};
  const chips = [
    { key: 'all', label: 'All', count: rows.length },
    ...EDD_BANDS.map((entry) => ({ key: entry.key, label: BAND_TONE[entry.key]?.label || entry.label, count: bands[entry.key] || 0 })),
    { key: 'problems', label: 'Problems', count: meta?.teams?.issues || 0 },
  ];

  return (
    <section className="space-y-3" aria-label="Production queue">
      {/* Who plans the queue — a warning when nobody does. */}
      <ProductionInChargeLine className="print:hidden" />
      <div className="flex flex-wrap gap-1 rounded-xl border border-line/[0.06] bg-line/[0.02] p-1 print:hidden" role="group" aria-label="Taken for production">
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

      {shown.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-base font-semibold text-steel-200">
            {!rows.length ? 'Nothing on the press right now.'
              : stage === 'not_taken' && !search && band === 'all' ? 'Every Production task is in the production queue.'
                : 'Nothing matches this filter.'}
          </p>
          <p className="mt-1 text-sm text-steel-500">{rows.length ? 'Pick another, or clear the search.' : 'A Production task raised on an enquiry appears here, in EDD order.'}</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {shown.map((row) => {
            const tone = BAND_TONE[row.band] || BAND_TONE.later;
            const models = row.models?.length ? row.models.map((entry) => entry.model) : [row.enquiry.model].filter(Boolean);
            return (
              <li key={row.task._id} className={`card border-l-4 ${tone.edge} p-3 sm:p-4`}>
                <div className="grid gap-3 md:grid-cols-[8.5rem_minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center">
                  {/* When it is due. */}
                  <div className="flex items-center gap-2 md:block">
                    <p className={`text-base font-bold tabular-nums ${row.band === 'late' ? 'text-danger-400' : 'text-steel-50'}`}>{row.edd ? formatDate(row.edd.date) : 'No EDD'}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone.chip}`}>{row.edd ? dueWords(row.edd.date) : 'give the date'}</span>
                  </div>
                  {/* Whose it is, and what. */}
                  <div className="min-w-0">
                    {/* A Production task raised from the customer with no enquiry is its own job. */}
                    {row.enquiry.team
                      ? <p className="font-bold text-steel-50">Team task{row.task.raisedBy?.name ? <span className="font-normal text-steel-400"> · {row.task.raisedBy.name}</span> : null}</p>
                      : <Link to={`/enquiries/${row.enquiry._id}`} className="font-bold text-steel-50 hover:text-accent">{row.enquiry.number}</Link>}
                    <p className="truncate text-sm text-steel-300">{row.enquiry.customer?.name || '—'}</p>
                    <p className="truncate text-xs text-steel-500">{models.join(', ') || '—'}{row.order?.number ? ` · ${row.order.number}` : ''}</p>
                    {row.production && (
                      <span
                        className={`mt-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-semibold ${row.production.taken ? 'bg-success-500/15 text-success-400' : 'bg-warn-500/15 text-warn-400'}`}
                        title={row.production.why || 'Not planned yet — add it to the production queue'}
                      >
                        {row.production.taken ? `In the queue${row.production.why && row.production.why !== 'Added to the production queue' ? ` · ${row.production.why}` : ''}` : 'Not in the queue yet'}
                      </span>
                    )}
                  </div>
                  {/* Where it stands, in at most thirty words, and its work orders. */}
                  <div className="min-w-0 space-y-1.5">
                    <p className={`text-sm leading-snug ${row.task.issue ? 'font-semibold text-danger-400' : 'text-steel-200'}`}>{row.summary}</p>
                    {row.workOrders?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {row.workOrders.map((wo) => <WorkOrderChip key={wo._id} wo={wo} orderId={row.order?._id} />)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 print:hidden">
                    {mayPlan && row.production && !row.production.taken && (
                      <button type="button" className="btn-primary justify-center px-3 py-2 text-sm" onClick={() => setAdding(row)}>Add to production queue</button>
                    )}
                    <Link to={row.link} className={`${mayPlan && row.production && !row.production.taken ? 'btn-secondary' : 'btn-primary'} justify-center px-3 py-2 text-sm`}>Workflow →</Link>
                    {/* Admin only, in the queue or not: closed with a reason, never wiped. */}
                    {isAdmin && (
                      <button type="button" className="btn-ghost justify-center px-3 py-1.5 text-xs text-danger-400" onClick={() => setDeleting(row)}>Delete task</button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {adding && (
        <AddToProductionQueue
          open
          task={adding.task}
          enquiryNumber={adding.enquiry.number || 'this team task'}
          onClose={() => setAdding(null)}
          onAdded={() => load()}
        />
      )}

      {deleting && <DeleteTaskDialog row={deleting} onClose={() => setDeleting(null)} onDeleted={() => load()} />}

      {!compact && (
        <p className="text-xs text-steel-500">
          {rows.length} open{asOf ? ` · as of ${formatRelative(asOf)}` : ''} · statuses, hand-overs to Printing and Assembly, and the EDD are given on each enquiry’s workflow page.
        </p>
      )}
    </section>
  );
}
