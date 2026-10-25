import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { machinesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, EmptyState, ErrorState, Field, FormError, Modal, PageHeader, TableSkeleton } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import PlantCalendarCard from '../components/PlantCalendarCard.jsx';
import { MACHINE_STATUSES, labelOf, toneOf } from '../utils/records.js';

/**
 * The machines on the floor [server: models/Machine.js]: each one's state, when it was last
 * serviced and when the next falls due — overdue ones first in red. Open one for its maintenance
 * history and the runs made on it.
 */

const BLANK = {
  code: '', name: '', make: '', tonnage: '', year: '', shotCapacityGrams: '', location: '', serviceEveryDays: '', status: 'idle', notes: '',
  tieBarWidthMm: '', tieBarHeightMm: '', minMouldHeightMm: '', maxMouldHeightMm: '', hotRunnerZones: '', hasDryer: '',
};
const NUMBERS = ['tonnage', 'year', 'shotCapacityGrams', 'serviceEveryDays', 'tieBarWidthMm', 'tieBarHeightMm', 'minMouldHeightMm', 'maxMouldHeightMm', 'hotRunnerZones'];
/* A dryer beside it: yes, no, or not said — a blank is "not checked", never "no". */
const dryerOf = (value) => (value === true ? 'yes' : value === false ? 'no' : '');

export function MachineEditor({ machine, onClose, onSaved }) {
  const [values, setValues] = useState(() => ({
    ...BLANK,
    ...Object.fromEntries(Object.entries(machine || {}).filter(([key]) => key in BLANK).map(([key, value]) => [key, value ?? ''])),
    hasDryer: dryerOf(machine?.hasDryer),
  }));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, NUMBERS.includes(key) ? (value === '' ? null : Number(value)) : value]));
    payload.hasDryer = values.hasDryer === '' ? null : values.hasDryer === 'yes';
    try {
      if (machine) await machinesApi.update({ id: machine._id, expectedUpdatedAt: machine.updatedAt, ...payload });
      else await machinesApi.create(payload);
      onSaved();
      onClose();
    } catch (failure) {
      setProblem(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={machine ? `Edit ${machine.code}` : 'Add a machine'}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Machine number" required><input className="input" value={values.code} onChange={set('code')} required maxLength={20} placeholder="IM-01" /></Field>
          <Field label="Name"><input className="input" value={values.name} onChange={set('name')} maxLength={80} placeholder="Toshiba 150T" /></Field>
          <Field label="Make"><input className="input" value={values.make} onChange={set('make')} maxLength={80} /></Field>
          <Field label="Tonnage"><input type="number" min={0} className="input" value={values.tonnage} onChange={set('tonnage')} /></Field>
          <Field label="Year"><input type="number" min={1950} max={2100} className="input" value={values.year} onChange={set('year')} /></Field>
          <Field label="Shot capacity, g"><input type="number" min={0} className="input" value={values.shotCapacityGrams} onChange={set('shotCapacityGrams')} /></Field>
          <Field label="Where it is" hint="Bay or group — the board groups presses by it"><input className="input" value={values.location} onChange={set('location')} maxLength={80} placeholder="Bay 2" /></Field>
          <Field label="Service every, days" hint="For the preventive maintenance reminder"><input type="number" min={0} className="input" value={values.serviceEveryDays} onChange={set('serviceEveryDays')} /></Field>
          <Field label="State">
            <select className="input" value={values.status} onChange={set('status')}>
              {MACHINE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </Field>
        </div>
        {/* What decides whether a mould fits, beyond tonnage and shot [server: planning.service `fitOf`]. Blank is "not checked". */}
        <fieldset className="space-y-3 rounded-lg border border-line/[0.08] p-3">
          <legend className="px-1 text-sm font-semibold text-steel-100">What moulds it takes</legend>
          <p className="text-xs text-steel-400">Leave blank what you have not measured — the app only checks what is filled in.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gap between tie bars, mm" hint="Width × height of the clear space">
              <div className="flex items-center gap-2">
                <input type="number" min={0} className="input" aria-label="Tie-bar gap width, mm" value={values.tieBarWidthMm} onChange={set('tieBarWidthMm')} placeholder="410" />
                <span className="text-steel-500" aria-hidden="true">×</span>
                <input type="number" min={0} className="input" aria-label="Tie-bar gap height, mm" value={values.tieBarHeightMm} onChange={set('tieBarHeightMm')} placeholder="410" />
              </div>
            </Field>
            <Field label="Mould thickness it closes on, mm" hint="Smallest to largest (daylight)">
              <div className="flex items-center gap-2">
                <input type="number" min={0} className="input" aria-label="Thinnest mould, mm" value={values.minMouldHeightMm} onChange={set('minMouldHeightMm')} placeholder="150" />
                <span className="text-steel-500" aria-hidden="true">to</span>
                <input type="number" min={0} className="input" aria-label="Thickest mould, mm" value={values.maxMouldHeightMm} onChange={set('maxMouldHeightMm')} placeholder="450" />
              </div>
            </Field>
            <Field label="Hot-runner zones" hint="0 if it has no hot-runner controller">
              <input type="number" min={0} max={64} className="input" value={values.hotRunnerZones} onChange={set('hotRunnerZones')} />
            </Field>
            <Field label="Dryer beside it">
              <select className="input" value={values.hasDryer} onChange={set('hasDryer')}>
                <option value="">Not said</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          </div>
        </fieldset>
        <Field label="Notes"><textarea className="input" value={values.notes} onChange={set('notes')} maxLength={1000} /></Field>
        {problem && <FormError error={problem} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !values.code.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Machines() {
  const { canWrite, mayPlanProduction } = useAuth();
  const mayEdit = canWrite('production');
  /* The machine register is the Production in charge's (or Admin's) to add to and change [server: requireProductionInCharge]. */
  const mayAddMachine = mayEdit && mayPlanProduction;
  const [machines, setMachines] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => machinesApi.list().then((rows) => { setMachines(rows); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  const overdue = (machines || []).filter((machine) => machine.serviceOverdue && machine.active !== false);
  const down = (machines || []).filter((machine) => machine.status === 'breakdown');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Machines & maintenance"
        subtitle="Every moulding machine, its state, and when it was last serviced. Open one for its full maintenance history and the runs made on it."
        actions={(
          <>
            <Link to="/mould-runs" className="btn-secondary">Mould runs</Link>
            {mayAddMachine && <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add a machine</button>}
          </>
        )}
      />
      {(overdue.length > 0 || down.length > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {down.length > 0 && <Badge tone="danger">{down.length} broken down</Badge>}
          {overdue.length > 0 && <Badge tone="progress">{overdue.length} due for service</Badge>}
        </div>
      )}
      <PlantCalendarCard mayEdit={mayEdit} />
      {error && <ErrorState error={error} onRetry={load} />}
      {!machines && !error && <TableSkeleton rows={5} columns={6} />}
      {machines && !machines.length && <EmptyState title="No machines yet" description={mayAddMachine ? 'Add each press once — its maintenance and runs are kept against it.' : 'The Production in charge adds the machines.'} />}
      {machines?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Machine</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3 text-right">Tonnage</th>
                  <th className="px-4 py-3">Where</th>
                  <th className="px-4 py-3">Last service</th>
                  <th className="px-4 py-3">Next due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.04]">
                {machines.map((machine) => (
                  <tr key={machine._id} className={`row-hover ${machine.active === false ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3.5">
                      <Link to={`/machines/${machine._id}`} className="font-semibold text-steel-100 hover:text-accent">{machine.code}</Link>
                      {machine.name && <p className="text-xs text-steel-500">{machine.name}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={toneOf(MACHINE_STATUSES, machine.status)}>{labelOf(MACHINE_STATUSES, machine.status)}</Badge>
                      {/* Whose job is on the press — the same run the enquiry and the production queue show. */}
                      {machine.running && (
                        <p className="mt-1 text-xs text-steel-300">
                          {machine.running.mould || 'Mould'}
                          {machine.running.enquiry ? (
                            <> · <Link to={`/enquiries/${machine.running.enquiry._id}`} className="font-semibold text-accent hover:underline">{machine.running.enquiry.number}</Link></>
                          ) : ' · stock run'}
                          {machine.running.customer ? ` · ${machine.running.customer}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">{machine.tonnage ? `${machine.tonnage}T` : '—'}</td>
                    <td className="px-4 py-3.5 text-steel-300">{machine.location || '—'}</td>
                    <td className="px-4 py-3.5 text-steel-300">{machine.lastServiceAt ? formatDate(machine.lastServiceAt) : 'Not recorded'}</td>
                    <td className={`px-4 py-3.5 ${machine.serviceOverdue ? 'font-semibold text-danger-400' : 'text-steel-300'}`}>
                      {machine.nextServiceDue ? `${formatDate(machine.nextServiceDue)}${machine.serviceOverdue ? ' — overdue' : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {adding && <MachineEditor onClose={() => setAdding(false)} onSaved={load} />}
    </div>
  );
}
