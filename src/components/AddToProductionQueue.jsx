import { useEffect, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { Modal, Notice } from './ui.jsx';
import { pathOf } from '../utils/edd.js';
import { todayInIndia } from '../utils/taskForm.js';

/**
 * Production adds its task to the production queue [server: handoff.service
 * `addToProductionQueue`] — one step for planning the job: model by model, printing and assembly
 * (so it runs Production → Printing → Assembly → Dispatch, each team tasked at once), the EDD if
 * known, and a remark. A task not yet planned moves to Planning; one already planning keeps its
 * status and takes the date. Opened from the Production desk and the Production workflow page.
 */
export default function AddToProductionQueue({ task, enquiryNumber, open, onClose, onAdded }) {
  const [rows, setRows] = useState(null);
  const [decided, setDecided] = useState(false);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setProblem(null);
    workspace.todos.routing(task._id).then((answer) => {
      if (!live) return;
      const said = new Map((answer.routing?.models || []).map((row) => [row.model, row]));
      setDecided(Boolean(answer.routing?.decidedAt));
      setRows((answer.models || []).map((entry) => ({
        model: entry.model, print: entry.print, hook: entry.hook, clip: entry.clip,
        printing: Boolean(said.get(entry.model)?.printing), assembly: Boolean(said.get(entry.model)?.assembly),
      })));
    }).catch((failure) => live && setProblem(failure.message));
    return () => { live = false; };
  }, [open, task._id]);

  const toggle = (index, key) => setRows((current) => current.map((row, at) => (at === index ? { ...row, [key]: !row[key] } : row)));
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const added = await workspace.todos.addToQueue({
        id: task._id,
        models: rows.map(({ model, printing, assembly }) => ({ model, printing, assembly })),
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
      title={`Add ${enquiryNumber || 'this enquiry'} to the production queue`}
      description="Plan it for the press: say which models are printed or assembled, and the EDD if you know it."
    >
      {!rows ? (
        problem ? <Notice tone="danger">{problem}</Notice> : <p className="text-sm text-steel-400">Loading the models…</p>
      ) : !rows.length ? (
        <Notice tone="warn">{task.enquiry ? 'The enquiry names no model. Add the model on the enquiry first.' : 'The task names no model. Edit the task’s hanger details to add it.'}</Notice>
      ) : (
        <form onSubmit={save} className="space-y-4" aria-label="Add to the production queue">
          <div>
            <p className="mb-1 text-sm font-semibold text-steel-100">After moulding{decided ? ' — decided before, change it if needed' : ''}</p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-steel-400">
                    <th className="py-1 pr-3 font-semibold">Model</th>
                    <th className="px-2 py-1 font-semibold">Printing</th>
                    <th className="px-2 py-1 font-semibold">Assembly</th>
                    <th className="py-1 pl-2 font-semibold">Goes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.06]">
                  {rows.map((row, index) => (
                    <tr key={row.model}>
                      <td className="py-1.5 pr-3">
                        <p className="font-semibold text-steel-100">{row.model}</p>
                        {(row.print || row.hook || row.clip) && (
                          <p className="text-xs text-steel-400">{[row.print && `Print: ${row.print}`, row.hook && `Hook: ${row.hook}`, row.clip && `Clip: ${row.clip}`].filter(Boolean).join(' · ')}</p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" className="h-4 w-4" aria-label={`Printing for ${row.model}`} checked={row.printing} onChange={() => toggle(index, 'printing')} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" className="h-4 w-4" aria-label={`Assembly for ${row.model}`} checked={row.assembly} onChange={() => toggle(index, 'assembly')} />
                      </td>
                      <td className="py-1.5 pl-2 text-xs text-steel-300">{pathOf(row)} → Dispatch</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <label className="block text-sm text-steel-300">
            EDD (optional)
            <input type="date" className="input mt-1" min={todayInIndia()} value={date} onChange={(event) => setDate(event.target.value)} />
            <span className="mt-1 block text-xs text-steel-500">Where a model goes to Printing or Assembly, this is the day Production hands it over.</span>
          </label>
          <label className="block text-sm text-steel-300">
            Remark
            <textarea className="input mt-1 min-h-[3.5rem]" maxLength={2000} placeholder="Press, slot, anything the plan depends on" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {problem && <Notice tone="danger">{problem}</Notice>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add to production queue'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
