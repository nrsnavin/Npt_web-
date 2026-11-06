import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eddChanges } from '../api/endpoints.js';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate, formatDateTime } from '../utils/format.js';
import { Field, Notice } from './ui.jsx';
import CustomerName from './CustomerName.jsx';

/**
 * EDD change requests [server: services/eddChange.service.js] — the EDD is followed, and every
 * move of it tracked.
 *
 *   EddChangeCard     one ask: today's EDD → the date asked, why, the thread; Agree / Reply / Keep
 *                     the EDD for Admin and the marketing person, Reply / Withdraw for the team
 *   TaskEddChanges    on a Production, Printing or Assembly task: Request EDD change, and its asks
 *   EnquiryEddTrack   the top of the enquiry: the EDD, first promised, moves, and any ask open
 */

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const STATE = {
  open: ['Waiting for an answer', 'text-warn-400 bg-warn-500/10'],
  agreed: ['Agreed', 'text-success-400 bg-success-500/10'],
  kept: ['EDD kept', 'text-steel-300 bg-line/[0.06]'],
  withdrawn: ['Withdrawn', 'text-steel-400 bg-line/[0.06]'],
};

export function EddChangeCard({ change, onChanged, showWhere = false }) {
  const [mode, setMode] = useState(null);
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [label, tone] = STATE[change.status] || STATE.open;
  const office = change.mayAgree;
  const run = (call) => async (event) => {
    event?.preventDefault?.();
    setBusy(true);
    setProblem(null);
    try {
      await call();
      setMode(null);
      setText('');
      setDate('');
      onChanged?.();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const enquiryId = change.enquiry?._id || change.enquiry;
  return (
    <article aria-label={`EDD change: ${change.reason}`} className={`rounded-xl border p-3 ${change.status === 'open' ? 'border-warn-500/40 bg-warn-500/[0.07]' : 'border-line/[0.1] bg-line/[0.02]'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-steel-50">
          {departmentLabel(change.department)} asks to move the EDD{change.model ? ` · ${change.model}` : ''}
          {showWhere && (
            <span className="font-normal text-steel-400">
              {enquiryId && change.enquiry?.number ? <> · <Link to={`/enquiries/${enquiryId}`} className="text-accent hover:underline">{change.enquiry.number}</Link></> : ''}
              {change.customer?.name ? <> · <CustomerName name={change.customer.name} /></> : ''}
            </span>
          )}
        </p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
      </div>
      <p className="mt-1 text-sm text-steel-100">
        <span className="tabular-nums">{change.currentEdd ? formatDate(change.currentEdd) : 'No EDD'}</span>
        <span className="mx-1.5 text-steel-500">→</span>
        <span className="font-semibold tabular-nums text-warn-400">{formatDate(change.status === 'agreed' ? change.agreedDate : change.requestedDate)}</span>
      </p>
      <ol className="mt-2 space-y-1.5">
        {(change.messages || []).map((message) => (
          <li key={message._id} className={`rounded-lg px-2.5 py-1.5 text-sm ${message.side === 'office' ? 'bg-accent/[0.07]' : 'bg-line/[0.04]'}`}>
            <span className="font-semibold text-steel-300">{message.side === 'office' ? 'Office' : departmentLabel(change.department)}:</span>{' '}
            {message.body}{message.date ? <span className="font-semibold text-steel-100"> · {formatDate(message.date)}</span> : null}
            <span className="block text-xs text-steel-500">{message.by?.name || ''}{message.at ? ` · ${formatDateTime(message.at)}` : ''}</span>
          </li>
        ))}
      </ol>
      {change.status === 'open' && (change.mayReply || change.mayWithdraw) && !mode && (
        <div className="mt-2 flex flex-wrap gap-2">
          {office && <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => { setMode('agree'); setDate(change.requestedDate); }}>Agree</button>}
          {change.mayReply && <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setMode('reply')}>Reply</button>}
          {office && <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setMode('keep')}>Keep the EDD</button>}
          {change.mayWithdraw && !office && <button type="button" className="row-action" onClick={run(() => eddChanges.withdraw(change._id))}>Withdraw</button>}
        </div>
      )}
      {mode === 'agree' && (
        <form onSubmit={run(() => eddChanges.agree({ id: change._id, date, note: text.trim() || undefined }))} className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
          <input type="date" className="input" aria-label="Agreed EDD" min={today()} value={date} onChange={(event) => setDate(event.target.value)} />
          <input className="input" aria-label="Note on the agreement" placeholder="Note (optional) — e.g. buyer told" value={text} onChange={(event) => setText(event.target.value)} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy || !date}>{busy ? 'Saving…' : 'Agree — move the EDD'}</button>
            <button type="button" className="btn-ghost" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </form>
      )}
      {mode === 'reply' && (
        <form onSubmit={run(() => eddChanges.reply({ id: change._id, body: text, date: date || undefined }))} className="mt-2 grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
          <input className="input" aria-label="Reply on the EDD change" placeholder={office ? 'A question, or another date you can offer' : 'Your answer — with a new date if you have one'} value={text} onChange={(event) => setText(event.target.value)} autoFocus />
          <input type="date" className="input" aria-label="Another date (optional)" min={today()} value={date} onChange={(event) => setDate(event.target.value)} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy || text.trim().length < 2}>{busy ? 'Sending…' : 'Send'}</button>
            <button type="button" className="btn-ghost" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </form>
      )}
      {mode === 'keep' && (
        <form onSubmit={run(() => eddChanges.keep({ id: change._id, note: text }))} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input className="input flex-1" aria-label="Why the EDD stays" placeholder="Why the EDD stays — the team reads it" value={text} onChange={(event) => setText(event.target.value)} autoFocus />
          <button type="submit" className="btn-primary" disabled={busy || text.trim().length < 3}>{busy ? 'Saving…' : 'Keep the EDD'}</button>
          <button type="button" className="btn-ghost" onClick={() => setMode(null)}>Cancel</button>
        </form>
      )}
      {problem && <div className="mt-2"><Notice tone="danger">{problem}</Notice></div>}
    </article>
  );
}

/** The models a task works on, for "which model's EDD" — none means the whole enquiry's. */
const modelsOf = (todo) => [...new Set([
  ...(todo?.modelStatuses || []).map((row) => row.model),
  ...(Array.isArray(todo?.brief?.items) ? todo.brief.items.map((row) => row.model) : []),
].filter(Boolean))];

/** On a Production, Printing or Assembly task: Request EDD change, and the asks on its job. */
export default function TaskEddChanges({ todo, onChanged }) {
  const [state, setState] = useState(null);
  const [asking, setAsking] = useState(false);
  const [form, setForm] = useState({ date: '', reason: '', model: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const load = useCallback(() => {
    eddChanges.onTask(todo._id).then((response) => setState({ rows: response.data || [], mayAsk: Boolean(response.mayAsk) })).catch(() => setState(null));
  }, [todo._id]);
  useEffect(() => { load(); }, [load]);
  if (!state || (!state.rows.length && !state.mayAsk)) return null;
  const models = modelsOf(todo);
  const changed = () => { load(); onChanged?.(); };
  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await eddChanges.ask({ id: todo._id, date: form.date, reason: form.reason, model: form.model || undefined });
      setAsking(false);
      setForm({ date: '', reason: '', model: '' });
      changed();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-line/[0.08] p-3" aria-label="EDD changes">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-steel-400">EDD changes{state.rows.length ? ` (${state.rows.length})` : ''}</p>
        {state.mayAsk && !asking && <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setAsking(true)}>Request EDD change</button>}
      </div>
      {asking && (
        <form onSubmit={send} className="mb-3 space-y-2" aria-label="Request EDD change">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="New date" required>
              <input type="date" className="input" min={today()} value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required />
            </Field>
            {models.length > 1 && (
              <Field label="For which model">
                <select className="input" value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}>
                  <option value="">All models — the enquiry’s EDD</option>
                  {models.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </Field>
            )}
          </div>
          <Field label="Why the date has to move" required>
            <textarea rows={2} className="input" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Mould repair, resin short, machine down…" required />
          </Field>
          <p className="text-xs text-steel-500">Goes to Admin and the enquiry’s marketing person. The EDD moves only when they agree.</p>
          {problem && <Notice tone="danger">{problem}</Notice>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || !form.date || form.reason.trim().length < 3}>{busy ? 'Sending…' : 'Send request'}</button>
          </div>
        </form>
      )}
      <div className="space-y-2">{state.rows.map((change) => <EddChangeCard key={change._id} change={change} onChanged={changed} />)}</div>
    </div>
  );
}

/** The top of the enquiry: the EDD as it stands, first promised, how often it moved, and any ask open. */
export function EnquiryEddTrack({ enquiryId, onChanged }) {
  const [track, setTrack] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const load = useCallback(() => { eddChanges.track(enquiryId).then(setTrack).catch(() => setTrack(null)); }, [enquiryId]);
  useEffect(() => { load(); }, [load]);
  if (!track || (!track.changes.length && !track.open.length)) return null;
  const changed = () => { load(); onChanged?.(); };
  const past = track.changes.filter((change) => change.status !== 'open');
  return (
    <section aria-label="EDD tracking" className={`card space-y-2 p-4 ${track.open.length ? 'border-warn-500/40' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-steel-50">
          EDD {track.current ? formatDate(track.current) : '—'}
          {track.open.length > 0 && <span className="ml-2 rounded-full bg-warn-500/15 px-2 py-0.5 text-xs font-semibold text-warn-400">{track.open.length} change asked</span>}
        </h2>
        <p className="text-xs text-steel-400">
          {track.first && track.first !== track.current ? `First promised ${formatDate(track.first)} · ` : ''}
          moved {track.moved} time{track.moved === 1 ? '' : 's'}
        </p>
      </div>
      {track.open.map((change) => <EddChangeCard key={change._id} change={change} onChanged={changed} />)}
      {past.length > 0 && (
        <>
          <button type="button" className="link-muted text-xs" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Hide' : 'Show'} the EDD history ({past.length})</button>
          {showAll && <div className="space-y-2">{past.map((change) => <EddChangeCard key={change._id} change={change} onChanged={changed} />)}</div>}
        </>
      )}
    </section>
  );
}
