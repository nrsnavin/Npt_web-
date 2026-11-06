import { useCallback, useEffect, useState } from 'react';
import { ppSamples } from '../api/endpoints.js';
import { formatDate } from '../utils/format.js';
import { Field, Modal, Notice } from './ui.jsx';

/**
 * The PP (pre-production) sample [server: services/ppSample.service.js]: ticked on the PO & SO
 * request, Production makes it, Dispatch prepares the DC and sends it, the enquiry's marketing
 * person (or Admin) records the buyer's answer — and bulk production waits until it is approved.
 *
 *   PpSampleCard       where it stands, each round and its answer, the DCs; Approved / Changes needed
 *   PpChallanDialog    Dispatch's DC: model, mould, material, hook, clip, printing, pieces, transport
 *   ChallansToInvoice  on Invoice & Dispatch: the DCs still to be added to the invoice
 */

const STATE_TONE = {
  making: 'border-warn-500/40 bg-warn-500/[0.07]',
  sending: 'border-warn-500/40 bg-warn-500/[0.07]',
  with_buyer: 'border-accent/40 bg-accent/[0.07]',
  approved: 'border-success-500/40 bg-success-500/[0.07]',
  cancelled: 'border-line/[0.1]',
};

export const MODES = [
  ['courier', 'Courier'], ['transporter', 'Transporter'], ['own_vehicle', 'Own vehicle'], ['hand_delivery', 'Hand delivery'], ['party_collects', 'Party collects'],
];

const piecesOf = (challan) => (challan?.lines || []).reduce((sum, line) => sum + (Number(line.pieces) || 0), 0);

function ChallanRow({ challan }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try { await ppSamples.openPdf(challan._id); } finally { setBusy(false); }
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-steel-100">
        <span className="font-semibold">{challan.number}</span>
        <span className="text-steel-400"> · {piecesOf(challan)} pcs{challan.round > 1 ? ` · round ${challan.round}` : ''}{challan.createdAt ? ` · ${formatDate(challan.createdAt)}` : ''}</span>
        {' '}
        {challan.status === 'invoiced'
          ? <span className="text-xs font-semibold text-success-400">On invoice {challan.invoice?.number}</span>
          : <span className="text-xs font-semibold text-warn-400">To be invoiced</span>}
      </span>
      <button type="button" className="row-action" disabled={busy} onClick={open}>{busy ? 'Opening…' : 'DC PDF'}</button>
    </li>
  );
}

function Answer({ pp, onAnswered }) {
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const send = async (verdict) => {
    setBusy(true);
    setProblem(null);
    try {
      onAnswered(await ppSamples.answer({ id: pp._id, verdict, note: note.trim() || undefined }));
      setMode(null);
      setNote('');
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm font-semibold text-steel-50">The buyer’s answer</p>
      {mode === 'changes' ? (
        <div className="space-y-2">
          <textarea rows={2} className="input" aria-label="What the buyer wants changed" placeholder="What the buyer wants changed — Production makes the next round from this" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy || note.trim().length < 3} onClick={() => send('changes')}>{busy ? 'Sending…' : 'Send for another round'}</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="input flex-1" aria-label="Remarks on the approval" placeholder="Remarks (optional)" value={note} onChange={(event) => setNote(event.target.value)} />
          <button type="button" className="btn-primary" disabled={busy} onClick={() => send('approved')}>{busy ? 'Saving…' : 'Approved — start production'}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setMode('changes')}>Changes needed</button>
        </div>
      )}
      {problem && <Notice tone="danger">{problem}</Notice>}
    </div>
  );
}

/** Where the PP sample stands — on the enquiry (`enquiryId`) or on a task (`taskId`). */
export default function PpSampleCard({ enquiryId = null, taskId = null, onChanged }) {
  const [state, setState] = useState(null);
  const load = useCallback(() => {
    const call = enquiryId ? ppSamples.ofEnquiry(enquiryId) : taskId ? ppSamples.ofTask(taskId) : null;
    call?.then(setState).catch(() => setState(null));
  }, [enquiryId, taskId]);
  useEffect(() => { load(); }, [load]);
  const pp = state?.pp;
  if (!pp) return null;
  const rounds = pp.rounds || [];
  return (
    <section aria-label="PP sample" className={`rounded-xl border p-3 ${STATE_TONE[pp.status] || ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-steel-50">PP sample{rounds.length > 1 ? ` · round ${rounds.length}` : ''}</p>
        <span className="text-xs font-semibold text-steel-300">{pp.statusWords}</span>
      </div>
      {pp.status !== 'approved' && <p className="mt-1 text-xs text-steel-400">Bulk production starts only after the buyer approves the PP sample.</p>}
      <ul className="mt-2 text-sm text-steel-200">
        {(pp.lines || []).map((line, at) => (
          <li key={at}>{line.model}{[line.material, line.hook, line.clip, line.print].filter(Boolean).length ? ` — ${[line.material, line.hook, line.clip, line.print].filter(Boolean).join(' · ')}` : ''}{line.pieces ? ` · ${line.pieces} pcs` : ''}</li>
        ))}
      </ul>
      {rounds.some((round) => round.verdict || round.brief) && (
        <ol className="mt-2 space-y-1 text-xs text-steel-300">
          {rounds.map((round) => (
            <li key={round._id || round.number}>
              <span className="font-semibold text-steel-200">Round {round.number}:</span>
              {round.brief ? ` asked to change — ${round.brief}.` : ''}
              {round.verdict === 'approved' && <span className="text-success-400"> Approved{round.verdictBy?.name ? ` by ${round.verdictBy.name}` : ''}{round.verdictNote ? ` — ${round.verdictNote}` : ''}</span>}
              {round.verdict === 'changes' && <span className="text-warn-400"> Changes needed{round.verdictBy?.name ? ` (${round.verdictBy.name})` : ''}</span>}
            </li>
          ))}
        </ol>
      )}
      {state.challans?.length > 0 && (
        <div className="mt-2 border-t border-line/[0.08] pt-2">
          <p className="text-xs font-semibold text-steel-400">Delivery challans</p>
          <ul className="divide-y divide-line/[0.06]">{state.challans.map((challan) => <ChallanRow key={challan._id} challan={challan} />)}</ul>
        </div>
      )}
      {state.mayAnswer && <Answer pp={pp} onAnswered={(next) => { setState(next); onChanged?.(); }} />}
    </section>
  );
}

/** Dispatch's DC on Send PP Sample: the round's lines, filled from the order, and how it travels. */
export function PpChallanDialog({ task, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    ppSamples.challanForm(task._id)
      .then((data) => setForm({ number: data.challan?.number || null, lines: data.lines?.length ? data.lines : [{ model: '', pieces: '' }], transport: data.transport || {}, remarks: data.remarks || '' }))
      .catch((failure) => setProblem(failure.message));
  }, [task._id]);
  const setLine = (at, key, value) => setForm((current) => ({ ...current, lines: current.lines.map((line, index) => (index === at ? { ...line, [key]: value } : line)) }));
  const setTransport = (key, value) => setForm((current) => ({ ...current, transport: { ...current.transport, [key]: value } }));
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const challan = await ppSamples.saveChallan({ taskId: task._id, lines: form.lines, transport: form.transport, remarks: form.remarks });
      onSaved?.(challan);
      onClose();
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  const COLUMNS = [['model', 'Model'], ['mould', 'Mould'], ['material', 'Material & colour'], ['hook', 'Hook'], ['clip', 'Clip'], ['printing', 'Printing'], ['pieces', 'Pieces']];
  return (
    <Modal open title={form?.number ? `Delivery challan ${form.number}` : 'Prepare the DC'} description="Goes with the PP sample, and is added to the order’s invoice later. No prices are printed." onClose={onClose} size="lg">
      {!form ? (problem ? <Notice tone="danger">{problem}</Notice> : <p className="text-sm text-steel-400">Loading…</p>) : (
        <form onSubmit={save} className="space-y-4">
          {form.lines.map((line, at) => (
            <fieldset key={at} className="rounded-lg border border-line/[0.08] p-3">
              <legend className="px-1 text-xs font-semibold text-steel-400">Line {at + 1}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {COLUMNS.map(([key, label]) => (
                  key === 'model' || key === 'pieces' ? (
                    /* The two a DC cannot go without — the server refuses a line missing either. */
                    <Field key={key} label={label} required>
                      <input
                        className="input"
                        aria-label={`${label}, line ${at + 1}`}
                        type={key === 'pieces' ? 'number' : 'text'}
                        inputMode={key === 'pieces' ? 'numeric' : undefined}
                        min={key === 'pieces' ? 1 : undefined}
                        value={line[key] ?? ''}
                        onChange={(event) => setLine(at, key, event.target.value)}
                        required
                      />
                    </Field>
                  ) : (
                    <Field key={key} label={label}>
                      <input className="input" aria-label={`${label}, line ${at + 1}`} value={line[key] ?? ''} onChange={(event) => setLine(at, key, event.target.value)} />
                    </Field>
                  )
                ))}
              </div>
              {form.lines.length > 1 && (
                <button type="button" className="row-action mt-2" onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, index) => index !== at) }))}>Remove line</button>
              )}
            </fieldset>
          ))}
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, { model: '', pieces: '' }] }))}>+ Add line</button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="How it goes">
              <select className="input" aria-label="How it goes" value={form.transport.mode || ''} onChange={(event) => setTransport('mode', event.target.value)}>
                <option value="">Choose…</option>
                {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Courier / transporter"><input className="input" aria-label="Courier or transporter" value={form.transport.courier || ''} onChange={(event) => setTransport('courier', event.target.value)} /></Field>
            <Field label="AWB / LR / reference"><input className="input" aria-label="AWB, LR or reference" value={form.transport.reference || ''} onChange={(event) => setTransport('reference', event.target.value)} /></Field>
            <Field label="Vehicle"><input className="input" aria-label="Vehicle" value={form.transport.vehicle || ''} onChange={(event) => setTransport('vehicle', event.target.value)} /></Field>
          </div>
          <Field label="Remarks"><textarea rows={2} className="input" value={form.remarks} onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))} /></Field>
          {problem && <Notice tone="danger">{problem}</Notice>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : form.number ? 'Save the DC' : 'Prepare DC'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** On Send PP Sample: the DC, prepared or still to prepare — the task is marked sent only once it is. */
export function PpChallanAction({ task, onChanged }) {
  const [open, setOpen] = useState(false);
  const [challan, setChallan] = useState(null);
  useEffect(() => {
    ppSamples.challanForm(task._id).then((data) => setChallan(data.challan)).catch(() => {});
  }, [task._id]);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line/[0.08] p-3">
      <p className="flex-1 text-sm text-steel-200">
        {challan ? <><span className="font-semibold">{challan.number}</span> prepared — {piecesOf(challan)} pcs. Mark the task PP Sample Sent once it goes.</> : 'Prepare the DC before sending — model, mould, material, hook, clip, printing and pieces.'}
      </p>
      {challan && <button type="button" className="row-action" onClick={() => ppSamples.openPdf(challan._id)}>DC PDF</button>}
      {!task.completed && <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>{challan ? 'Edit DC' : 'Prepare DC'}</button>}
      {open && <PpChallanDialog task={task} onClose={() => setOpen(false)} onSaved={(saved) => { setChallan(saved); onChanged?.(); }} />}
    </div>
  );
}

/** On Invoice & Dispatch: the PP sample DCs still to add to the invoice, and which invoice took each. */
export function ChallansToInvoice({ task }) {
  const [state, setState] = useState(null);
  const [marking, setMarking] = useState(null);
  const [invoice, setInvoice] = useState({ number: '', date: '' });
  const [problem, setProblem] = useState(null);
  const load = useCallback(() => {
    ppSamples.challansOfTask(task._id, { status: 'to_invoice' }).then((response) => setState({ rows: response.data || [], mayInvoice: response.mayInvoice })).catch(() => setState(null));
  }, [task._id]);
  useEffect(() => { load(); }, [load]);
  if (!state?.rows?.length) return null;
  const mark = async (event) => {
    event.preventDefault();
    setProblem(null);
    try {
      await ppSamples.invoiced({ id: marking, number: invoice.number, date: invoice.date || undefined });
      setMarking(null);
      setInvoice({ number: '', date: '' });
      load();
    } catch (failure) {
      setProblem(failure.message);
    }
  };
  return (
    <section aria-label="DCs to add to the invoice" className="rounded-xl border border-warn-500/40 bg-warn-500/[0.07] p-3">
      <p className="text-sm font-bold text-steel-50">Add to the invoice: PP sample DC{state.rows.length > 1 ? 's' : ''}</p>
      <p className="text-xs text-steel-400">These pieces went without an invoice — bill them on this order’s invoice.</p>
      <ul className="mt-1 divide-y divide-line/[0.06]">
        {state.rows.map((challan) => (
          <li key={challan._id} className="py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-steel-100"><span className="font-semibold">{challan.number}</span><span className="text-steel-400"> · {(challan.lines || []).map((line) => `${line.model} × ${line.pieces}`).join(', ')}</span></span>
              <span className="flex gap-3">
                <button type="button" className="row-action" onClick={() => ppSamples.openPdf(challan._id)}>DC PDF</button>
                {state.mayInvoice && marking !== challan._id && <button type="button" className="row-action" onClick={() => setMarking(challan._id)}>Added to invoice</button>}
              </span>
            </div>
            {marking === challan._id && (
              <form onSubmit={mark} className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input className="input flex-1" aria-label="Invoice number" placeholder="Invoice number" value={invoice.number} onChange={(event) => setInvoice((current) => ({ ...current, number: event.target.value }))} autoFocus />
                <input className="input sm:w-44" type="date" aria-label="Invoice date" value={invoice.date} onChange={(event) => setInvoice((current) => ({ ...current, date: event.target.value }))} />
                <button type="submit" className="btn-primary" disabled={invoice.number.trim().length < 2}>Save</button>
                <button type="button" className="btn-ghost" onClick={() => setMarking(null)}>Cancel</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {problem && <div className="mt-2"><Notice tone="danger">{problem}</Notice></div>}
    </section>
  );
}
