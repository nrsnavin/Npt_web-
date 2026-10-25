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
 * Only a model ready goes: its last team — Assembly, else Printing, else Production — has marked it
 * Ready for Dispatch [server: dispatchSheet `ready`]; one not ready cannot be ticked and says who
 * still has it. Every ready model still to go starts ticked. The app says what the load makes it — Part Quantity Dispatched
 * while anything is still to go (on this request or an earlier one), Fully Dispatched once
 * everything ordered has gone — and only Fully Dispatched offers to close the task.
 */
const LIMIT = 1024 * 1024;
const WAITING_WORDS = { production: 'Production', printing: 'Printing', assembling: 'Assembly' };
/* Where a model not ready is now — the team holding it and its status there [server: handoff.service `modelReadiness`]. */
const whereNow = (row) => `${row.waitingOn === 'production' ? 'in' : 'with'} ${WAITING_WORDS[row.waitingOn] || 'the plant'}${row.waitingStatus ? ` · ${row.waitingStatus}` : ''}`;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export default function DispatchLoadDialog({ todo, onClose, onDone }) {
  const { toast } = useToast();
  const [sheet, setSheet] = useState(null);
  const [problem, setProblem] = useState(null);
  const [ticked, setTicked] = useState({});
  const [pieces, setPieces] = useState({});
  const [mode, setMode] = useState('');
  const [file, setFile] = useState(null);
  /* What Dispatch knows of how it went — all optional. */
  const [details, setDetails] = useState({ lrNumber: '', transporter: '', vehicleNumber: '' });
  const setDetail = (key) => (event) => setDetails((current) => ({ ...current, [key]: event.target.value }));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    let live = true;
    workspace.todos.dispatchSheet(todo._id).then((data) => {
      if (!live) return;
      setSheet(data);
      const left = (row) => Math.max(0, (row.ordered || 0) - (row.sent || 0));
      const starts = (row) => (left(row) > 0 || !row.ordered) && row.ready;
      setTicked(Object.fromEntries(data.models.map((row) => [row.model, starts(row)])));
      setPieces(Object.fromEntries(data.models.map((row) => [row.model, left(row) ? String(left(row)) : ''])));
    }).catch((failure) => live && setProblem(failure.message));
    return () => { live = false; };
  }, [todo._id]);

  const models = sheet?.models || [];
  /* All together [server: recordDispatchLoad]: nothing goes until every model is ready. */
  const togetherWaiting = sheet && sheet.plan !== 'by_model' ? models.filter((row) => !row.ready) : [];
  /* What may go in a load: ready, and something of it still to go — and, all together, only once every model is ready. */
  const goable = togetherWaiting.length ? [] : models.filter((row) => row.ready && (Math.max(0, (row.ordered || 0) - (row.sent || 0)) > 0 || !row.ordered));
  const chosen = togetherWaiting.length ? [] : models.filter((row) => ticked[row.model] && row.ready);
  const allTicked = goable.length > 0 && goable.every((row) => ticked[row.model]);
  const how = (sheet?.modes || []).find((entry) => entry.key === mode) || null;
  const total = chosen.reduce((sum, row) => sum + (Number(pieces[row.model]) || 0), 0);
  const missingPieces = chosen.find((row) => !(Number(pieces[row.model]) > 0));
  /* Never more than is left of a model [server: recordDispatchLoad refuses it too]. */
  const overLeft = chosen.find((row) => row.ordered && Number(pieces[row.model]) > Math.max(0, row.ordered - (row.sent || 0)));
  const tooBig = file && file.size > LIMIT;
  const wrongType = file && !TYPES.includes(file.type);
  /* The paper is optional — Reception has the LR copy to chase, and it can be added to the load later. */
  const ready = chosen.length > 0 && !missingPieces && !overLeft && how && !tooBig && !wrongType;
  /* What this load leaves: every model ordered gone in full makes it Fully Dispatched [server: recordDispatchLoad]. */
  const leftAfter = models.map((row) => {
    const going = ticked[row.model] && row.ready ? Number(pieces[row.model]) || 0 : 0;
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
        id: todo._id, mode, note: note.trim() || undefined, file, details,
        lines: chosen.map((row) => ({ model: row.model, quantity: Number(pieces[row.model]) })),
      });
      const said = saved.status === 'fully_dispatched' ? 'Fully Dispatched' : 'Part Quantity Dispatched';
      toast(said, !file ? `${how.proofLabel} to follow — add it to the load when it comes; it is listed on the task.` : mode === 'transporter' ? 'Reception has the LR copy to send to the buyer.' : `${how.proofLabel} kept on the task.`);
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
                disabled={!goable.length}
                onChange={(event) => setTicked(Object.fromEntries(models.map((row) => [row.model, event.target.checked && goable.includes(row)])))}
              />
              Select all ready
            </label>
            {models.map((row) => {
              const left = Math.max(0, (row.ordered || 0) - (row.sent || 0));
              /* Sent in full: nothing of it can go again. */
              const gone = Boolean(row.ordered) && left <= 0;
              return (
                <div key={row.model} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2">
                  <label className="flex min-w-0 items-center gap-2 text-sm text-steel-200">
                    <input type="checkbox" disabled={!row.ready || gone || togetherWaiting.length > 0} checked={Boolean(ticked[row.model]) && row.ready && !gone && !togetherWaiting.length} onChange={(event) => setTicked({ ...ticked, [row.model]: event.target.checked })} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{row.model}</span>
                      <span className="block text-xs text-steel-400">
                        {row.ordered ? `${row.ordered.toLocaleString('en-IN')} ordered` : 'Quantity not on the order'}
                        {row.sent ? ` · ${row.sent.toLocaleString('en-IN')} sent` : ''}
                        {row.ordered ? (gone ? <span className="font-semibold text-success-400"> · sent in full</span> : ` · ${left.toLocaleString('en-IN')} to go`) : ''}
                        {!row.ready && <span className="font-semibold text-warn-400"> · not ready — {whereNow(row)}</span>}
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={row.ordered ? left : undefined}
                    className="input py-1.5"
                    aria-label={`Pieces of ${row.model} in this load`}
                    disabled={!ticked[row.model] || !row.ready || gone}
                    value={pieces[row.model] || ''}
                    onChange={(event) => setPieces({ ...pieces, [row.model]: event.target.value })}
                  />
                </div>
              );
            })}
            {togetherWaiting.length > 0 ? (
              <Notice tone="warn">
                This order goes all together — nothing is dispatched until every model is ready. Still waiting: {togetherWaiting.map((row) => `${row.model} (${whereNow(row)})`).join(', ')}.
                Marketing can change it to send each model as it is ready.
              </Notice>
            ) : !goable.length && (
              <Notice tone="warn">Nothing is ready to dispatch yet — a model goes once its last team (Assembly, else Printing, else Production) marks it Ready for Dispatch.</Notice>
            )}
            {chosen.length > 0 && <p className="text-xs text-steel-400">{total.toLocaleString('en-IN')} pcs in this load</p>}
            {overLeft && (
              <p className="text-xs font-semibold text-danger-400" role="alert">
                {overLeft.model}: only {Math.max(0, overLeft.ordered - (overLeft.sent || 0)).toLocaleString('en-IN')} pcs left to send. If the buyer takes more, change the pieces on the sales order first.
              </p>
            )}
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
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {how.key === 'transporter' && <Field label="LR / docket number"><input className="input" value={details.lrNumber} maxLength={80} onChange={setDetail('lrNumber')} /></Field>}
              {how.key === 'transporter' && <Field label="Transporter"><input className="input" value={details.transporter} maxLength={120} placeholder="VRL Logistics" onChange={setDetail('transporter')} /></Field>}
              {how.key !== 'party_collects' && <Field label="Vehicle number"><input className="input" value={details.vehicleNumber} maxLength={40} placeholder="TN 39 AB 1234" onChange={setDetail('vehicleNumber')} /></Field>}
            </div>
            <Field
              label={`${how.proofLabel} (optional)`}
              hint={how.key === 'transporter'
                ? 'PDF or photo, 1 MB at most — it goes to Reception’s LR Copy task. Not here yet? Send the load; Reception chases the LR, and it can be added to the load later.'
                : 'PDF or photo, 1 MB at most — kept on the task. Not here yet? Add it to the load later.'}
              error={tooBig ? 'That file is over 1 MB' : wrongType ? 'Attach a PDF, or a JPEG / PNG photo' : undefined}
            >
              <input type="file" accept={TYPES.join(',')} capture="environment" className="input" aria-label={how.proofLabel} onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </Field>
          </>
        )}
        <Field label="Remarks" hint="Who collected, anything else — optional">
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
