import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Field, Modal, Notice } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * The loads on a Dispatch request still without their paper [server: handoff.service `addLoadProof`]:
 * the goods went before the LR copy, proof of delivery or signed receipt came — Reception chases the
 * LR copy, and the Dispatch team adds the paper (and the LR number, transporter, vehicle) here when
 * it comes. A transporter's LR copy goes on to Reception to send to the buyer.
 */

const PROOF = { transporter: 'LR copy', own_vehicle: 'Proof of delivery', party_collects: 'Signed receipt / photo' };
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const LIMIT = 1024 * 1024;
const linesOf = (load) => (load.lines || []).map((line) => `${line.model} ${Number(line.quantity || 0).toLocaleString('en-IN')} pcs`).join(' · ');

function AddPaper({ todo, load, onClose, onSaved }) {
  const { toast } = useToast();
  const proof = PROOF[load.mode] || 'Paper';
  const [file, setFile] = useState(null);
  const [details, setDetails] = useState({ lrNumber: load.lrNumber || '', transporter: load.transporter || '', vehicleNumber: load.vehicleNumber || '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (key) => (event) => setDetails((current) => ({ ...current, [key]: event.target.value }));
  const bad = file && (!TYPES.includes(file.type) || file.size > LIMIT);
  const changed = Object.entries(details).filter(([key, value]) => String(value || '').trim() && value !== (load[key] || ''));
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const saved = await workspace.todos.loadProof({ id: todo._id, loadId: load._id, file, details: Object.fromEntries(changed) });
      toast('Added to the load', file && load.mode === 'transporter' ? 'Reception has the LR copy to send to the buyer.' : linesOf(load));
      onSaved(saved);
      onClose();
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Add ${proof} / details`} description={`Load of ${formatDate(load.at)} — ${linesOf(load)}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label={proof} hint="PDF or photo, 1 MB at most" error={bad ? 'Attach a PDF, JPEG or PNG under 1 MB' : undefined}>
          <input type="file" accept={TYPES.join(',')} capture="environment" className="input" aria-label={proof} onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          {load.mode === 'transporter' && <Field label="LR / docket number"><input className="input" value={details.lrNumber} maxLength={80} onChange={set('lrNumber')} /></Field>}
          {load.mode === 'transporter' && <Field label="Transporter"><input className="input" value={details.transporter} maxLength={120} onChange={set('transporter')} /></Field>}
          {load.mode !== 'party_collects' && <Field label="Vehicle number"><input className="input" value={details.vehicleNumber} maxLength={40} onChange={set('vehicleNumber')} /></Field>}
        </div>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || bad || (!file && !changed.length)}>{busy ? 'Saving…' : 'Add to the load'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function LoadPaper({ todo, mayAdd, onChanged }) {
  const [adding, setAdding] = useState(null);
  const pending = (todo?.loads || []).filter((load) => !load.attachment);
  if (todo?.kind !== 'invoice_dispatch' || !pending.length) return null;
  return (
    <div className="rounded-lg border border-warn-500/40 bg-warn-500/[0.07] px-3 py-2 text-xs" aria-label="Paper to add">
      <p className="font-semibold text-warn-400">Paper to add — {pending.length} load{pending.length > 1 ? 's' : ''} went without it</p>
      <ul className="mt-1 space-y-1">
        {pending.map((load) => (
          <li key={load._id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-steel-200">
              {formatDate(load.at)} · {linesOf(load)} · {PROOF[load.mode] || 'Paper'} to come
              {load.lrNumber ? ` · LR ${load.lrNumber}` : ''}{load.transporter ? ` · ${load.transporter}` : ''}{load.vehicleNumber ? ` · ${load.vehicleNumber}` : ''}
            </span>
            {mayAdd && <button type="button" className="row-action text-xs" onClick={() => setAdding(load)}>Add {PROOF[load.mode] || 'paper'} / details</button>}
          </li>
        ))}
      </ul>
      {adding && <AddPaper todo={todo} load={adding} onClose={() => setAdding(null)} onSaved={(saved) => onChanged?.(saved)} />}
    </div>
  );
}
