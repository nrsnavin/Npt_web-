import { useState } from 'react';
import { maintenanceApi } from '../api/endpoints.js';
import { Field, FormError, Modal } from './ui.jsx';
import MachineSelect from './MachineSelect.jsx';
import { MAINTENANCE_TYPES } from '../utils/records.js';
import { isoDay } from '../utils/format.js';

/**
 * Records one piece of maintenance on a machine or a mould [server: records.service
 * `recordMaintenance`]. Opened from the machine or the mould it is about, so which one is already
 * known. Saving sets when the next service falls due — by date for a machine, by shot count for a
 * mould — and puts it back to working unless "still down" is ticked.
 */
export default function MaintenanceForm({ open, asset, machine, mould, onClose, onSaved }) {
  const blank = () => ({ type: asset === 'mould' ? 'polishing' : 'preventive', doneOn: isoDay(), problem: '', workDone: '', doneBy: '', vendor: '', downtimeHours: '', labourCost: '', onMachine: '', nextDueOn: '', parts: [], stillDown: false });
  const [values, setValues] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const setPart = (index, key, value) => setValues((current) => ({ ...current, parts: current.parts.map((part, at) => (at === index ? { ...part, [key]: value } : part)) }));
  const number = (value) => (value === '' || value == null ? undefined : Number(value));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await maintenanceApi.create({
        asset,
        machine: asset === 'machine' ? machine?._id : undefined,
        mould: asset === 'mould' ? mould?._id : undefined,
        onMachine: asset === 'mould' ? values.onMachine || undefined : undefined,
        type: values.type,
        doneOn: values.doneOn ? new Date(`${values.doneOn}T12:00:00+05:30`).toISOString() : undefined,
        problem: values.problem,
        workDone: values.workDone,
        doneBy: values.doneBy,
        vendor: values.vendor,
        downtimeHours: number(values.downtimeHours),
        labourCost: number(values.labourCost),
        nextDueOn: values.nextDueOn ? new Date(`${values.nextDueOn}T12:00:00+05:30`).toISOString() : undefined,
        parts: values.parts.filter((part) => part.name.trim()).map((part) => ({ name: part.name, quantity: number(part.quantity), cost: number(part.cost) })),
        backInService: !values.stillDown,
      });
      setValues(blank());
      onSaved?.();
      onClose();
    } catch (failure) {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };

  const what = asset === 'mould' ? `${mould?.mouldCode || 'the mould'}` : `${machine?.code || 'the machine'}`;
  return (
    <Modal open={open} onClose={onClose} title={`Record maintenance on ${what}`} description="What was wrong, what was done, and what it took" size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind of work" required>
            <select className="input" value={values.type} onChange={set('type')} required>
              {MAINTENANCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </Field>
          <Field label="Done on" required><input type="date" className="input" value={values.doneOn} max={isoDay()} onChange={set('doneOn')} required /></Field>
        </div>
        <Field label="What was wrong" hint="Leave empty for routine work"><textarea className="input min-h-[3.5rem]" value={values.problem} onChange={set('problem')} maxLength={1000} /></Field>
        <Field label="What was done" required><textarea className="input min-h-[3.5rem]" value={values.workDone} onChange={set('workDone')} maxLength={2000} required minLength={3} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Done by"><input className="input" value={values.doneBy} onChange={set('doneBy')} maxLength={120} placeholder="Our fitter / tool room" /></Field>
          <Field label="Outside vendor"><input className="input" value={values.vendor} onChange={set('vendor')} maxLength={120} /></Field>
          <Field label="Hours it was down"><input type="number" min={0} step="any" className="input" value={values.downtimeHours} onChange={set('downtimeHours')} /></Field>
          <Field label="Labour cost, ₹"><input type="number" min={0} step="any" className="input" value={values.labourCost} onChange={set('labourCost')} /></Field>
          {asset === 'mould' && <Field label="On machine" hint="The press it was on when it was taken off"><MachineSelect value={values.onMachine} onChange={(value) => setValues((current) => ({ ...current, onMachine: value }))} /></Field>}
          {asset === 'machine' && <Field label="Next service due" hint={machine?.serviceEveryDays ? `Leave empty for ${machine.serviceEveryDays} days from this one` : 'Leave empty if there is no schedule'}><input type="date" className="input" value={values.nextDueOn} onChange={set('nextDueOn')} /></Field>}
        </div>

        <div className="space-y-2">
          <p className="label">Spares used</p>
          {values.parts.map((part, index) => (
            <div key={index} className="grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-2">
              <input className="input" value={part.name} onChange={(event) => setPart(index, 'name', event.target.value)} placeholder="Heater band" aria-label="Spare name" maxLength={120} />
              <input type="number" min={0} className="input" value={part.quantity} onChange={(event) => setPart(index, 'quantity', event.target.value)} aria-label="Spare quantity" placeholder="Qty" />
              <input type="number" min={0} className="input" value={part.cost} onChange={(event) => setPart(index, 'cost', event.target.value)} aria-label="Spare cost" placeholder="₹" />
              <button type="button" className="btn-ghost text-xs" onClick={() => setValues((current) => ({ ...current, parts: current.parts.filter((_, at) => at !== index) }))}>Remove</button>
            </div>
          ))}
          <button type="button" className="btn-secondary text-sm" onClick={() => setValues((current) => ({ ...current, parts: [...current.parts, { name: '', quantity: '', cost: '' }] }))}>Add a spare</button>
        </div>

        <label className="flex items-center gap-2 text-sm text-steel-200">
          <input type="checkbox" checked={values.stillDown} onChange={(event) => setValues((current) => ({ ...current, stillDown: event.target.checked }))} />
          Still down — not back in service yet
        </label>

        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || values.workDone.trim().length < 3}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
