import { useState } from 'react';
import { Field } from '../ui.jsx';
import { WEIGHT_PRESETS, weightWords } from '../../utils/planningBoard.js';

/** "⚑ 9" on a bar or a waiting card — only for a job weighed above normal, so the urgent ones stand out. */
export function WeightTag({ job, className = '' }) {
  if (!job?.weight || job.weight <= 5) return null;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md bg-danger-500/15 px-1.5 text-xs font-bold tabular-nums text-danger-400 ${className}`} title={`Weightage ${job.weight} — ${weightWords(job.weight)}${job.weightage ? '' : ', from the order’s priority'}`}>
      ⚑ {job.weight}
    </span>
  );
}

/**
 * The job's weightage, set by the Production in charge [server: workOrder.service `planWorkOrder`]:
 * an urgent order weighed higher goes ahead of the lighter jobs not yet running on its press, and the
 * suggested schedule serves the heaviest first, each on the press free soonest.
 */
export default function WeightagePicker({ job, busy, onSave }) {
  const [note, setNote] = useState('');
  const save = (weightage) => onSave({ weightage, ...(note.trim() ? { note: note.trim() } : {}) }, weightage == null ? 'Back to the order’s priority' : `Weightage ${weightage}`);
  return (
    <section aria-label="Weightage" className="space-y-2">
      <p className="text-sm font-semibold text-steel-100">
        Weightage <span className="font-normal text-steel-400">— {job.weight} · {weightWords(job.weight)}{job.weightage ? '' : ' (the order’s priority)'}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {WEIGHT_PRESETS.map(({ value, label }) => (
          <button key={value} type="button" disabled={busy} aria-pressed={job.weight === value} onClick={() => save(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${job.weight === value ? 'bg-accent text-white ring-accent' : 'text-steel-200 ring-line/[0.12] hover:bg-line/[0.06]'}`}>
            {label} · {value}
          </button>
        ))}
        {job.weightage != null && <button type="button" className="row-action text-xs" disabled={busy} onClick={() => save(null)}>Use the order’s priority</button>}
      </div>
      <Field label="Why (optional)"><input className="input" value={note} maxLength={300} placeholder="Buyer’s launch on the 5th" onChange={(event) => setNote(event.target.value)} /></Field>
      <p className="text-xs text-steel-500">Heavier jobs run ahead of lighter ones not yet started on the press.</p>
    </section>
  );
}
