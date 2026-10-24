import { useEffect, useMemo, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Field, Modal, Notice } from './ui.jsx';
import CloseTaskPrompt from './CloseTaskPrompt.jsx';

/**
 * A load sent on a Dispatch request [server: handoff.service `recordDispatchLoad`]: tick the
 * models going (or Select all), the pieces of each, how it travels, and upload the paper that
 * proves it — the transporter's LR copy (Reception's LR Copy task gets it to send to the buyer),
 * the proof of delivery from our own vehicle, or the signed receipt when the party collects.
 *
 * An order going out together starts with every model still to go ticked; one going out model by
 * model starts with the ready ones. The app says what the load makes it — Part Quantity Dispatched
 * while anything is still to go (on this request or an earlier one), Fully Dispatched once
 * everything ordered has gone — and only Fully Dispatched offers to close the task.
 */
const LIMIT = 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export default function DispatchLoadDialog({ todo, onClose, onDone }) {
  const { toast } = useToast();
  const [sheet, setSheet] = useState(null);
  const [problem, setProblem] = useState(null);
  const [ticked, setTicked] = useState({});
  const [pieces, setPieces] = useState({});
  const [mode, setMode] = useState('');
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    let live = true;
    workspace.todos.dispatchSheet(todo._id).then((data) => {
      if (!live) return;
      setSheet(data);
      const left = (row) => Math.max(0, (row.ordered || 0) - (row.sent || 0));
      const starts = (row) => (left(row) > 0 || !row.ordered) && (data.plan !== 'by_model' || row.ready);
      setTicked(Object.fromEntries(data.models.map((row) => [row.model, starts(row)])));
      setPieces(Object.fromEntries(data.models.map((row) => [row.model, left(row) ? String(left(row)) : ''])));
    }).catch((failure) => live && setProblem(failure.message));
    return () => { live = false; };
  }, [todo._id]);

  const models = sheet?.models || [];
  const chosen = models.filter((row) => ticked[row.model]);
  const allTicked = models.length > 0 && chosen.length === models.length;
  const how = (sheet?.modes || []).find((entry) => entry.key === mode) || null;
  const total = chosen.reduce((sum, row) => sum + (Number(pieces[row.model]) || 0), 0);
  const missingPieces = chosen.find((row) => !(Number(pieces[row.model]) > 0));
  const tooBig = file && file.size > LIMIT;
  const wrongType = file && !TYPES.includes(file.type);
  const ready = chosen.length > 0 && !missingPieces && how && file && !tooBig && !wrongType;
  /* What this load leaves: every model ordered gone in full makes it Fully Dispatched [server: recordDispatchLoad]. */
  const leftAfter = models.map((row) => {
    const going = ticked[row.model] ? Number(pieces[row.model]) || 0 : 0;
    return { model: row.model, left: row.ordered ? Math.max(0, row.ordered - (row.sent || 0) - going) : (row.sent || going ? 0 : 1), known: Boolean(row.ordered) };
  });
  const stillToGo = leftAfter.filter((row) => row.left > 0);
  const outcome = models.length && !stillToGo.length ? 'Fully Dispatched' : 'Part Quantity Dispatched';
  const sentWords = useMemo(() => chosen.map((row) => `${row.model} ${Number(pieces[row.model] || 0).toLocaleString('en-IN')}`).join(' · '), [chosen, pieces]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const saved = await workspace.todos.dispatchLoad({
        id: todo._id, mode, note: note.trim() || undefined, file,
        lines: chosen.map((row) => ({ model: row.model, quantity: Number(pieces[row.model]) })),
      });
      const said = saved.status === 'fully_dispatched' ? 'Fully Dispatched' : 'Part Quantity Dispatched';
      toast(said, mode === 'transporter' ? 'Reception has the LR copy to send to the buyer.' : `${how.proofLabel} kept on the task.`);
      /* Fully Dispatched: nothing left to send — close the task now? The screen refreshes once that is answered. */
      if (saved.status === 'fully_dispatched' && !saved.completed) setOffer(saved);
      else {
        onDone?.(saved);
        onClose();
      }
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };

  if (offer) {
    return (
      <CloseTaskPrompt
        task={offer}
        why={`Fully Dispatched — ${sentWords} sent, and everything ordered has gone. Close the task if nothing more goes on it.`}
        onClose={() => { onDone?.(offer); onClose(); }}
        onClosed={(saved) => { toast('Task closed', 'Fully Dispatched — the request is done.'); onDone?.(saved); onClose(); }}
      />
    );
  }

  return (
    <Modal open title="Dispatch a load" description="Tick the models in this load, the pieces of each, and how it travels." onClose={onClose}>
      <form onSubmit={save} className="space-y-4" aria-label="Dispatch load">
        {!sheet && !problem && <p className="text-sm text-steel-400">Loading the models…</p>}
        {sheet && (
          <fieldset className="space-y-2 rounded-lg border border-line/[0.1] p-3">
            <legend className="px-1 text-xs font-semibold text-steel-300">
              Models in this load{sheet.plan === 'by_model' ? ' · each model as it is ready' : ' · all together'}
            </legend>
            <label className="flex items-center gap-2 border-b border-line/[0.06] pb-2 text-sm font-semibold text-steel-100">
              <input
                type="checkbox"
                checked={allTicked}
                onChange={(event) => setTicked(Object.fromEntries(models.map((row) => [row.model, event.target.checked])))}
              />
              Select all
            </label>
            {models.map((row) => {
              const left = Math.max(0, (row.ordered || 0) - (row.sent || 0));
              return (
                <div key={row.model} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2">
                  <label className="flex min-w-0 items-center gap-2 text-sm text-steel-200">
                    <input type="checkbox" checked={Boolean(ticked[row.model])} onChange={(event) => setTicked({ ...ticked, [row.model]: event.target.checked })} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{row.model}</span>
                      <span className="block text-xs text-steel-400">
                        {row.ordered ? `${row.ordered.toLocaleString('en-IN')} ordered` : 'Quantity not on the order'}
                        {row.sent ? ` · ${row.sent.toLocaleString('en-IN')} sent` : ''}
                        {row.ordered ? ` · ${left.toLocaleString('en-IN')} to go` : ''}
                        {!row.ready && <span className="font-semibold text-warn-400"> · not ready yet</span>}
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="input py-1.5"
                    aria-label={`Pieces of ${row.model} in this load`}
                    disabled={!ticked[row.model]}
                    value={pieces[row.model] || ''}
                    onChange={(event) => setPieces({ ...pieces, [row.model]: event.target.value })}
                  />
                </div>
              );
            })}
            {chosen.length > 0 && <p className="text-xs text-steel-400">{total.toLocaleString('en-IN')} pcs in this load</p>}
            {/* What the load makes it — the app decides, Dispatch never has to pick. */}
            {chosen.length > 0 && (
              <p className={`rounded-md px-2.5 py-1.5 text-sm font-semibold ${stillToGo.length ? 'bg-warn-500/10 text-warn-400' : 'bg-success-500/10 text-success-400'}`} aria-live="polite">
                This load makes it {outcome}
                {stillToGo.length > 0 && (
                  <span className="block text-xs font-normal text-steel-300">
                    Still to go: {stillToGo.map((row) => (row.known ? `${row.model} ${row.left.toLocaleString('en-IN')} pcs` : row.model)).join(', ')}
                  </span>
                )}
              </p>
            )}
          </fieldset>
        )}
        {sheet && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium text-steel-200">Mode of travel</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mode of travel">
              {sheet.modes.map((entry) => (
                <label key={entry.key} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${mode === entry.key ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line/[0.1] text-steel-300'}`}>
                  <input type="radio" name="mode" value={entry.key} className="sr-only" checked={mode === entry.key} onChange={() => { setMode(entry.key); setFile(null); }} />
                  {entry.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {how && (
          <Field
            label={how.proofLabel}
            required
            hint={how.key === 'transporter' ? 'PDF or photo, 1 MB at most — it goes to Reception’s LR Copy task to send to the buyer' : 'PDF or photo, 1 MB at most — kept on the task'}
            error={tooBig ? 'That file is over 1 MB' : wrongType ? 'Attach a PDF, or a JPEG / PNG photo' : undefined}
          >
            <input type="file" required accept={TYPES.join(',')} capture="environment" className="input" aria-label={how.proofLabel} onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </Field>
        )}
        <Field label="Remarks" hint="Vehicle, LR number, who collected — optional">
          <input className="input" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {missingPieces && <p className="text-xs text-warn-400">Give the pieces of {missingPieces.model}</p>}
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !ready}>{busy ? 'Saving…' : 'Save dispatch'}</button>
        </div>
      </form>
    </Modal>
  );
}
