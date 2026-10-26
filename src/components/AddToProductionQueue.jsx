import { useEffect, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { Modal, Notice } from './ui.jsx';
import RegisterPick from './RegisterPick.jsx';
import { pathOf } from '../utils/edd.js';
import { todayInIndia } from '../utils/taskForm.js';
import { formatDate } from '../utils/format.js';

/**
 * Production adds its task to the production queue [server: handoff.service
 * `addToProductionQueue`] — one step for planning the job: model by model, printing and assembly
 * (so it runs Production → Printing → Assembly → Dispatch, each team tasked at once), the EDD if
 * known, and a remark. A task not yet planned moves to Planning; one already planning keeps its
 * status and takes the date. Opened from the Production desk and the Production workflow page.
 *
 * Each model's details first [server: handoff.service `fillQueueDetails`]: an enquiry that reached
 * Production without its model, material or pieces has them given here by the in charge — the
 * model from the mould register, material & colour, pieces, hook, clip, print — and a model added.
 * They go on the task (the pieces the plan and the work orders count) and fill the enquiry's
 * blanks; a detail the enquiry already says is corrected there only when asked.
 */

/* The details asked of each model, from the registers where there is one. */
const DETAILS = [
  { key: 'material', label: 'Material & colour', register: 'materials' },
  { key: 'quantity', label: 'Pieces', type: 'number' },
  { key: 'hook', label: 'Hook', register: 'hooks' },
  { key: 'clip', label: 'Clip', register: 'clips' },
  { key: 'print', label: 'Print', register: 'prints' },
];
const MODEL_FIELD = { key: 'model', label: 'Model', register: 'moulds' };
const blankRow = () => ({ model: '', material: '', quantity: '', hook: '', clip: '', print: '', printing: false, assembly: false, added: true });
const pieces = (value) => Number(String(value ?? '').replace(/,/g, ''));

export default function AddToProductionQueue({ task, enquiryNumber, open, onClose, onAdded }) {
  const [rows, setRows] = useState(null);
  const [decided, setDecided] = useState(false);
  /* The EDD marketing or Admin set [server: handoff.service `marketingEddFor`]: shown, and the date starts from it. */
  const [edd, setEdd] = useState(null);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  /* The SO's pieces are the order's — read here, changed on the SO. */
  const [fromOrder, setFromOrder] = useState(false);
  const [registers, setRegisters] = useState({});
  const [updateEnquiry, setUpdateEnquiry] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setProblem(null);
    workspace.todos.routing(task._id).then((answer) => {
      if (!live) return;
      const said = new Map((answer.routing?.models || []).map((row) => [row.model, row]));
      setDecided(Boolean(answer.routing?.decidedAt));
      setEdd(answer.edd || null);
      setFromOrder(Boolean(answer.fromOrder));
      /* The same EDD follows onto the plan unless Production changes it — never a day already past. */
      if (answer.edd?.date && answer.edd.date >= todayInIndia()) setDate((current) => current || answer.edd.date);
      const known = (answer.models || []).map((entry) => ({
        model: entry.model, material: entry.material || '', quantity: entry.quantity || '', hook: entry.hook || '', clip: entry.clip || '', print: entry.print || '',
        printing: Boolean(said.get(entry.model)?.printing), assembly: Boolean(said.get(entry.model)?.assembly), added: false,
      }));
      /* Nothing named at all: one model to give. */
      setRows(known.length ? known : [blankRow()]);
    }).catch((failure) => live && setProblem(failure.message));
    workspace.todos.registers().then((data) => live && setRegisters(data || {})).catch(() => {});
    return () => { live = false; };
  }, [open, task._id]);

  const toggle = (index, key) => setRows((current) => current.map((row, at) => (at === index ? { ...row, [key]: !row[key] } : row)));
  const set = (index, key, value) => setRows((current) => current.map((row, at) => (at === index ? { ...row, [key]: value } : row)));
  const named = (rows || []).filter((row) => row.model.trim());
  const twice = named.find((row, at) => named.findIndex((other) => other.model.trim().toLowerCase() === row.model.trim().toLowerCase()) !== at);
  const noPieces = named.find((row) => !(pieces(row.quantity) > 0));
  /* What still stops the plan: a model, and its pieces. */
  const missing = !named.length ? 'Name the model' : twice ? `${twice.model} is named twice` : noPieces ? `Give the pieces for ${noPieces.model}` : null;

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const added = await workspace.todos.addToQueue({
        id: task._id,
        items: named.map((row) => ({
          model: row.model.trim(),
          ...Object.fromEntries(DETAILS.map((field) => [field.key, String(row[field.key] ?? '').trim()]).filter(([, value]) => value)),
        })),
        ...(updateEnquiry ? { updateEnquiry: true } : {}),
        models: named.map(({ model, printing, assembly }) => ({ model: model.trim(), printing, assembly })),
        ...(date ? { date } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onAdded?.(added);
      onClose();
    } catch (failure) {
      setProblem(failure?.response?.data?.message || failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Add ${enquiryNumber || 'this enquiry'} to the production queue`}
      description="Plan it for the press: each model's details where the enquiry left them out, which are printed or assembled, and the EDD if you know it."
    >
      {!rows ? (
        problem ? <Notice tone="danger">{problem}</Notice> : <p className="text-sm text-steel-400">Loading the models…</p>
      ) : (
        <form onSubmit={save} className="space-y-4" aria-label="Add to the production queue">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-steel-100">Each model — its details, then what follows moulding{decided ? ' (decided before — change it if needed)' : ''}</p>
            {rows.map((row, index) => {
              const label = row.model.trim() || `Model ${index + 1}`;
              return (
                <fieldset key={index} className="space-y-2 rounded-xl border border-line/[0.08] p-3" aria-label={label}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {row.added ? (
                      <div className="min-w-[14rem] flex-1">
                        <RegisterPick field={MODEL_FIELD} register={registers.moulds || []} value={row.model} onChange={(value) => set(index, 'model', value)} />
                      </div>
                    ) : <p className="font-semibold text-steel-50">{row.model}</p>}
                    {row.added && rows.length > 1 && (
                      <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => setRows((current) => current.filter((_, at) => at !== index))}>Remove</button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {DETAILS.map((field) => {
                      const locked = field.key === 'quantity' && fromOrder && !row.added && Boolean(row.quantity);
                      return (
                        <div key={field.key} className="text-xs text-steel-400">
                          <span>{field.label}{field.key === 'quantity' ? ' *' : ''}</span>
                          <div className="mt-1">
                            {field.key === 'quantity' ? (
                              <input
                                type="number" min={1} inputMode="numeric" className="input" aria-label={`Pieces of ${label}`}
                                value={row.quantity} readOnly={locked}
                                onChange={(event) => set(index, 'quantity', event.target.value)}
                              />
                            ) : (
                              <RegisterPick field={{ ...field, label: `${field.label} of ${label}` }} register={registers[field.register] || []} value={row[field.key]} onChange={(value) => set(index, field.key, value)} />
                            )}
                          </div>
                          {locked && <span className="mt-0.5 block text-steel-500">From the SO — change it on the SO</span>}
                        </div>
                      );
                    })}
                  </div>
                  {!row.material.trim() && row.model.trim() && <p className="text-xs text-warn-400">No material given — the floor plans the resin from it.</p>}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-steel-200">
                    <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" aria-label={`Printing for ${label}`} checked={row.printing} onChange={() => toggle(index, 'printing')} />Printing</label>
                    <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" aria-label={`Assembly for ${label}`} checked={row.assembly} onChange={() => toggle(index, 'assembly')} />Assembly</label>
                    <span className="text-xs text-steel-400">{pathOf(row)} → Dispatch</span>
                  </div>
                </fieldset>
              );
            })}
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setRows((current) => [...current, blankRow()])}>+ Add a model</button>
            {task.enquiry && (
              <label className="flex items-start gap-2 text-xs text-steel-300">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={updateEnquiry} onChange={(event) => setUpdateEnquiry(event.target.checked)} />
                <span>Also correct the enquiry where I changed a detail it already gives. Blanks on the enquiry, and models it does not name, are filled either way.</span>
              </label>
            )}
          </div>
          {/* The EDD the buyer is promised, as marketing or Admin set it. */}
          {edd ? (
            <div className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-steel-100" aria-label="EDD set by marketing">
              <p><span className="font-semibold">EDD set by marketing{edd.by ? ` (${edd.by})` : ''}:</span> {edd.date ? formatDate(edd.date) : 'model by model'}</p>
              {edd.models?.length > 0 && (
                <p className="text-xs text-steel-300">{edd.models.map((row) => `${row.model}: ${formatDate(row.date)}`).join(' · ')}</p>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-warn-500/10 px-3 py-2 text-sm text-warn-400">Marketing has not set the EDD yet.</p>
          )}
          <label className="block text-sm text-steel-300">
            EDD{edd?.date ? ' — filled from marketing’s, change it if needed' : ' (optional)'}
            <input type="date" className="input mt-1" min={todayInIndia()} value={date} onChange={(event) => setDate(event.target.value)} />
            <span className="mt-1 block text-xs text-steel-500">Where a model goes to Printing or Assembly, this is the day Production hands it over.</span>
          </label>
          <label className="block text-sm text-steel-300">
            Remark
            <textarea className="input mt-1 min-h-[3.5rem]" maxLength={2000} placeholder="Press, slot, anything the plan depends on" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {problem && <Notice tone="danger">{problem}</Notice>}
          {missing && <p className="text-sm text-warn-400">{missing}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || Boolean(missing)}>{busy ? 'Adding…' : 'Add to production queue'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
