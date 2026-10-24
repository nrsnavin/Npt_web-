import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { departments as departmentsApi, workspace } from '../api/endpoints.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import HandoffTaskActions from './HandoffTaskActions.jsx';
import TaskWorkflow from './TaskWorkflow.jsx';
import TaskPdfLink from './TaskPdfLink.jsx';
import { TaskFacts } from './TaskHistory.jsx';
import { EmptyState, ErrorState, Modal, TableSkeleton } from './ui.jsx';
import { formatDate } from '../utils/format.js';
import { piecesOf as pieces, rupeesOf as rupees, sizeWords } from '../utils/soDesk.js';

/**
 * The SO team's desk [server: services/soDesk.service.js]. Every open SO request, read for what
 * to do with it before it is opened:
 *
 *   readiness   "Ready to prepare" or "Missing: price for NPT-400S · payment terms" — with Ask
 *               marketing one click away; ready requests come first
 *   size        models · pieces · value in the header, and the value waiting to be booked on a tile
 *   EDD         the earliest date a line promises, red when it is a week off and no SO exists yet
 *   buyer       the last order and its terms, the credit status, what is overdue
 *   duplicate   an order already open on the enquiry, or a second request for it
 *   question    a Needs Clarification's question and marketing's answer, inline
 *
 * The queue as cards, one a request — the SO team's only view of its department tasks — plus the
 * week's bookings and where each went, and the prepared orders not yet in production. On each card:
 * the workflow, the SO upload that finishes it, and Escalate to Admin — nothing else.
 */

const CREDIT = { good: 'text-success-400', watch: 'text-warn-400', hold: 'text-danger-400' };
const WENT = { production: 'bg-success-500/15 text-success-400', held: 'bg-warn-500/15 text-warn-400', advance: 'bg-danger-500/15 text-danger-400', checks: 'bg-line/[0.08] text-steel-300', none: 'bg-line/[0.08] text-steel-400' };

/** Ready, or what is missing — the first thing on every request. */
function Readiness({ so, onAsk }) {
  const { ready, missing, soft } = so.readiness;
  if (ready) {
    return (
      <p className="text-xs font-semibold text-success-400">
        ✓ Ready to prepare{soft.length > 0 && <span className="font-normal text-steel-400"> · no {soft.join(', ')} yet</span>}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs font-semibold text-warn-400">⚠ Missing: <span className="font-normal text-steel-200">{missing.join(' · ')}</span></p>
      {onAsk && <button type="button" className="row-action text-xs" onClick={onAsk}>Ask marketing</button>}
    </div>
  );
}

function EddChip({ edd }) {
  if (!edd) return null;
  const late = edd.days != null && edd.days < 0;
  const tone = late || edd.urgent ? 'bg-danger-500/15 text-danger-400' : 'bg-line/[0.08] text-steel-300';
  const words = late ? `EDD ${edd.pretty} — past` : edd.days === 0 ? `EDD today` : edd.days === 1 ? 'EDD tomorrow' : `EDD ${edd.pretty}${edd.urgent ? ` · ${edd.days} days` : ''}`;
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`} title={edd.urgent ? 'A week or less away and no SO yet' : undefined}>{words}</span>;
}

/** The buyer as the SO team should know them before preparing. */
function BuyerLine({ buyer }) {
  if (!buyer) return null;
  const credit = buyer.credit?.status || 'good';
  return (
    <p className="text-xs text-steel-400">
      {buyer.lastOrder
        ? <>Last order <span className="text-steel-200">{buyer.lastOrder.number}</span> · {formatDate(buyer.lastOrder.date)}{buyer.usualTerms ? ` · ${buyer.usualTerms}` : ''}</>
        : 'First order from this buyer'}
      {credit !== 'good' && <> · <span className={`font-semibold ${CREDIT[credit]}`}>{credit === 'hold' ? 'Credit on hold' : 'Credit watch'}{buyer.credit.reason ? ` — ${buyer.credit.reason}` : ''}</span></>}
      {buyer.overdue > 0 && <> · <span className="font-semibold text-danger-400">{rupees(buyer.overdue)} overdue</span></>}
      {!buyer.overdue && buyer.outstanding > 0 && <> · {rupees(buyer.outstanding)} outstanding</>}
    </p>
  );
}

/** A Needs Clarification: the question, and the answer when it comes — without opening the task. */
function Question({ question, task, onChanged }) {
  if (!question) return null;
  const gotIt = async () => onChanged?.(await workspace.todos.seen(task._id));
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${question.answer ? 'border-success-500/40 bg-success-500/[0.06]' : 'border-warn-500/40 bg-warn-500/[0.06]'}`}>
      <p className="text-steel-300"><span className="font-semibold text-steel-100">Asked:</span> {question.question || '—'}{question.askedAt ? <span className="text-steel-500"> · {formatDate(question.askedAt)}</span> : null}</p>
      {question.answer ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-steel-100"><span className="font-semibold text-success-400">Answer:</span> {question.answer.text || 'Answered'}<span className="text-steel-500"> · {formatDate(question.answer.at)}</span></p>
          {task.attention?.kind === 'reply' && <button type="button" className="row-action text-xs" onClick={gotIt}>Got it</button>}
        </div>
      ) : (
        <p className="mt-1 font-semibold text-warn-400">Waiting on {question.waitingOn?.name || 'marketing'}{question.waitingOn?.since ? ` since ${formatDate(question.waitingOn.since)}` : ''}</p>
      )}
    </div>
  );
}

/** One request, as a card: what to do with it on top, the request as entered, the team's workflow under it. */
function SoCard({ row, onChanged, onAsk }) {
  const { task, enquiry, so } = row;
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, task.kind);
  const owner = enquiry?.assignedTo?.name || task.createdBy?.name;
  return (
    <article className={`card flex flex-col gap-2.5 p-4 ${so.edd?.urgent || row.late ? 'border-danger-500/30' : ''}`} aria-label={`SO request ${enquiry?.number || 'team task'}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-steel-50">
            {enquiry ? <Link to={`/enquiries/${enquiry._id}`} className="hover:text-accent">{enquiry.number}</Link> : 'Team task'}
            <span className="font-normal text-steel-300"> · {(enquiry ? enquiry.customer?.name : task.customer?.name) || '—'}</span>
          </p>
          <p className="text-sm font-semibold text-steel-200">{sizeWords(so.size) || 'No lines yet'}{so.terms ? <span className="font-normal text-steel-400"> · {so.terms}</span> : null}{so.poNumber ? <span className="font-normal text-steel-400"> · PO {so.poNumber}</span> : null}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {row.late ? <span className="rounded-full bg-danger-500/15 px-2.5 py-1 text-[0.75rem] font-bold uppercase tracking-wide text-danger-400">Late</span>
            : row.dueToday ? <span className="rounded-full bg-warn-500/15 px-2.5 py-1 text-[0.75rem] font-bold uppercase tracking-wide text-warn-400">Due today</span> : null}
          <EddChip edd={so.edd} />
        </div>
      </header>
      <Readiness so={so} onAsk={!so.readiness.ready && task.status !== 'clarification' ? () => onAsk(row) : null} />
      {so.duplicate && (
        <p className="rounded-lg border border-danger-500/40 bg-danger-500/[0.07] px-3 py-1.5 text-xs font-semibold text-danger-400">
          {so.duplicate.order ? <>{so.duplicate.order.number} is already open on this enquiry — second order, or a repeat?</> : null}
          {so.duplicate.order && so.duplicate.requests ? ' ' : null}
          {so.duplicate.requests ? <>{so.duplicate.requests} other SO request{so.duplicate.requests > 1 ? 's' : ''} open for this enquiry.</> : null}
        </p>
      )}
      <BuyerLine buyer={so.buyer} />
      <Question question={so.question} task={task} onChanged={onChanged} />
      <TaskFacts button={button} task={task} />
      <TaskPdfLink file={task.attachment} className="self-start" />
      {task.notes && <p className="text-sm text-steel-300">“{task.notes}”</p>}
      <p className="text-xs text-steel-500">Here since {formatDate(row.since)} · {task.user?.name ? `with ${task.user.name}` : 'nobody has picked it up'}{owner ? ` · ${owner}’s buyer` : ''}</p>
      <div className="border-t border-line/[0.06] pt-3"><TaskWorkflow todo={task} onChanged={onChanged} /></div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line/[0.06] pt-2">
        <HandoffTaskActions todo={task} onChanged={onChanged} />
      </div>
    </article>
  );
}

/** Asking marketing for what is missing: Needs Clarification, pre-filled with the gaps. */
function AskMarketing({ row, onClose, onChanged }) {
  const [note, setNote] = useState(`Please add: ${row.so.readiness.missing.join(', ')}.`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const send = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onChanged?.(await workspace.todos.status({ id: row.task._id, status: 'clarification', note }));
      onClose();
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal open title="Ask marketing" description={`${row.enquiry?.number || 'Team task'} · the request moves to Needs Clarification`} onClose={onClose}>
      <textarea rows={3} className="input w-full" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
      {problem && <p className="mt-2 text-sm text-danger-400">{problem}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn-primary" onClick={send} disabled={busy || note.trim().length < 3}>{busy ? 'Sending…' : 'Send to marketing'}</button>
      </div>
    </Modal>
  );
}

function Tile({ label, value, hint, tone = 'text-steel-50' }) {
  return (
    <div className="card px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="text-xs font-semibold text-steel-400">{label}</p>
      <p className={`text-xl font-bold sm:text-2xl ${tone}`}>{value}</p>
      {hint && <p className="hidden text-xs text-steel-500 sm:block">{hint}</p>}
    </div>
  );
}

export default function SoDesk({ onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(null);
  const [search, setSearch] = useState('');
  const load = useCallback(() => departmentsApi.soDesk().then((answer) => { setData(answer); setError(null); }).catch((failure) => setError(failure)), []);
  useEffect(() => { load(); }, [load]);
  const changed = () => { load(); onChanged?.(); };

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((row) => [row.enquiry?.number, row.enquiry?.customer?.name, row.task.customer?.name, ...(row.so.lines || []).map((line) => line.model)]
      .filter(Boolean).some((text) => String(text).toLowerCase().includes(term)));
  }, [data, search]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <TableSkeleton rows={5} columns={4} />;
  const { summary, booked, held, others } = data;

  return (
    <section className="space-y-4" aria-label="SO desk">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
        <Tile label="Waiting to be booked" value={rupees(summary.value)} hint={`${pieces(summary.pieces)} across ${summary.requests} request${summary.requests === 1 ? '' : 's'}`} />
        <Tile label="Ready to prepare" value={summary.ready} tone="text-success-400" hint="Every line priced, terms given" />
        <Tile label="Missing details" value={summary.missing} tone={summary.missing ? 'text-warn-400' : 'text-steel-50'} hint="Ask marketing from the card" />
        <Tile label="EDD within a week" value={summary.eddSoon} tone={summary.eddSoon ? 'text-danger-400' : 'text-steel-50'} hint="No SO yet — Production waits" />
        <Tile label="Booked this week" value={rupees(summary.bookedValue)} hint={`${summary.bookedCount} SO${summary.bookedCount === 1 ? '' : 's'} prepared · ${summary.heldCount} not in production`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-steel-500">Ready first, then by the earliest EDD.</p>
        <input aria-label="Search enquiry, buyer or model" type="search" className="input ml-auto w-full sm:w-64" placeholder="Search enquiry, buyer or model…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      {rows.length === 0 ? (
        <EmptyState title={data.rows.length ? 'Nothing matches the search' : 'No SO request open'} description={data.rows.length ? 'Clear the search to see them all.' : 'When marketing sends an enquiry to PO & SO, it appears here.'} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => <SoCard key={row.task._id} row={row} onChanged={changed} onAsk={setAsking} />)}
        </div>
      )}

      {others?.length > 0 && (
        <p className="text-xs text-steel-500">{others.length} other task{others.length > 1 ? 's' : ''} on this desk (not SO requests) — see Department tasks on the enquiry.</p>
      )}

      {(held.length > 0 || booked.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4" aria-label="Prepared, not yet in production">
            <h3 className="text-sm font-bold text-steel-100">Prepared, not yet in production <span className="font-normal text-steel-500">{held.length}</span></h3>
            <p className="mb-2 text-xs text-steel-500">The orders the team gets asked about: held with marketing, waiting for the advance, or on their checks.</p>
            {held.length === 0 ? <p className="text-sm text-steel-500">None — every prepared SO is in production.</p> : (
              <ul className="divide-y divide-line/[0.04] text-sm">
                {held.map((row) => (
                  <li key={row.order._id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link to={`/orders/${row.order._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.order.number}</Link>
                    <span className="text-steel-300">{row.customer}</span>
                    <span className="text-xs text-steel-500">{pieces(row.pieces)} · {rupees(row.value)}</span>
                    <span className={`ml-auto rounded-md px-2 py-0.5 text-xs font-semibold ${WENT[row.went.key]}`}>{row.went.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-4" aria-label="Booked this week">
            <h3 className="text-sm font-bold text-steel-100">Booked this week <span className="font-normal text-steel-500">{booked.length}</span></h3>
            <p className="mb-2 text-xs text-steel-500">Each SO prepared in the last seven days, and where it went.</p>
            {booked.length === 0 ? <p className="text-sm text-steel-500">Nothing prepared this week yet.</p> : (
              <ul className="divide-y divide-line/[0.04] text-sm">
                {booked.map((row) => (
                  <li key={row.task._id} className="flex flex-wrap items-center gap-2 py-2">
                    {row.order ? <Link to={`/orders/${row.order._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.order.number}</Link> : <span className="font-semibold text-steel-300">No order</span>}
                    <span className="text-steel-300">{row.customer}{row.enquiry ? ` · ${row.enquiry.number}` : ''}</span>
                    <span className="text-xs text-steel-500">{pieces(row.pieces)} · {rupees(row.value)} · {formatDate(row.task.completedAt)}</span>
                    <span className={`ml-auto rounded-md px-2 py-0.5 text-xs font-semibold ${WENT[row.went.key]}`}>{row.went.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {asking && <AskMarketing row={asking} onClose={() => setAsking(null)} onChanged={changed} />}
    </section>
  );
}
