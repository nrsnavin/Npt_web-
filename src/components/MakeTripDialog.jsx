import { useEffect, useMemo, useState } from 'react';
import { tripsApi } from '../api/endpoints.js';
import { Field, Modal } from './ui.jsx';

/**
 * Make a trip from a group on the planner [components/TripPlanner.jsx]: which day and time, what
 * it goes on and who drives, and the cartons for each stop — with the total held against what the
 * vehicle carries. The buyers ticked on the group are the stops, in that order.
 */

const MODES = [
  { key: 'own_vehicle', label: 'Our vehicle' },
  { key: 'transport', label: 'Transport booking' },
  { key: 'party_collects', label: 'Party collects' },
  { key: 'courier', label: 'Courier' },
];

const indiaDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86400000));

export default function MakeTripDialog({ open, group, stops, plan, onClose, onMade }) {
  const transporterOfGroup = group?.key?.includes('transporter:') ? group.key.split('transporter:')[1] : '';
  const [values, setValues] = useState({});
  const [cartons, setCartons] = useState({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    if (!open) return;
    const first = plan.vehicles[0];
    setValues({
      day: 'tomorrow', date: indiaDay(1), departAt: '', mode: group?.mode || 'own_vehicle',
      vehicle: first?._id || '', transporter: transporterOfGroup !== 'none' ? transporterOfGroup : '',
      driverName: first?.driverName || '', driverPhone: first?.driverPhone || '', note: '',
    });
    setCartons({});
    setProblem(null);
  }, [open]);

  const vehicle = plan.vehicles.find((row) => row._id === values.vehicle);
  const total = useMemo(() => Object.values(cartons).reduce((sum, value) => sum + (Number(value) || 0), 0), [cartons]);
  const over = values.mode === 'own_vehicle' && vehicle?.capacityCartons && total > vehicle.capacityCartons;
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const pickVehicle = (event) => {
    const chosen = plan.vehicles.find((row) => row._id === event.target.value);
    setValues((current) => ({ ...current, vehicle: event.target.value, driverName: chosen?.driverName || '', driverPhone: chosen?.driverPhone || '' }));
  };
  const day = values.day === 'today' ? indiaDay() : values.day === 'tomorrow' ? indiaDay(1) : values.date;

  const make = async (event) => {
    event.preventDefault();
    setProblem(null);
    if (values.mode === 'transport' && !values.transporter) return setProblem('Pick the transporter the goods are booked with.');
    if (values.mode === 'own_vehicle' && !values.vehicle && !values.driverName.trim()) return setProblem('Pick the vehicle, or say who is driving.');
    setBusy(true);
    try {
      const trip = await tripsApi.create({
        tasks: stops.map((stop) => stop.task),
        mode: values.mode,
        date: day,
        departAt: values.departAt.trim() || undefined,
        vehicle: values.mode === 'own_vehicle' ? values.vehicle || undefined : undefined,
        transporter: values.mode === 'transport' ? values.transporter : undefined,
        driverName: values.driverName.trim() || undefined,
        driverPhone: values.driverPhone.trim() || undefined,
        note: values.note.trim() || undefined,
        cartons: Object.fromEntries(Object.entries(cartons).filter(([, value]) => value !== '').map(([task, value]) => [task, Number(value)])),
      });
      onMade(trip);
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
    return null;
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Make a trip" description={`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} from ${group?.label || 'this group'}`}>
      <form onSubmit={make} className="space-y-4">
        <fieldset>
          <legend className="label">When</legend>
          <div className="flex flex-wrap items-center gap-2">
            {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['other', 'Another day']].map(([key, label]) => (
              <button key={key} type="button" aria-pressed={values.day === key} onClick={() => setValues((current) => ({ ...current, day: key }))}
                className={`rounded-full border px-3 py-1 text-sm font-semibold ${values.day === key ? 'border-accent bg-accent/15 text-accent' : 'border-line/[0.12] text-steel-300'}`}>
                {label}
              </button>
            ))}
            {values.day === 'other' && (
              <input type="date" className="input w-auto" min={indiaDay()} value={values.date} onChange={set('date')} aria-label="Trip date" />
            )}
            <input className="input w-36" placeholder="Time, e.g. 2 pm" value={values.departAt} onChange={set('departAt')} maxLength={20} aria-label="Leaves at" />
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Goes by">
            <select className="input" value={values.mode} onChange={set('mode')}>
              {MODES.map((mode) => <option key={mode.key} value={mode.key}>{mode.label}</option>)}
            </select>
          </Field>
          {values.mode === 'own_vehicle' && (
            <Field label="Vehicle" hint={plan.vehicles.length ? undefined : 'No vehicles on the list yet — add them under Transporters & routes, or just name the driver.'}>
              <select className="input" value={values.vehicle} onChange={pickVehicle}>
                <option value="">Hired / not on the list</option>
                {plan.vehicles.map((row) => (
                  <option key={row._id} value={row._id}>{row.number}{row.kind ? ` · ${row.kind}` : ''}{row.capacityCartons ? ` · ${row.capacityCartons} cartons` : ''}</option>
                ))}
              </select>
            </Field>
          )}
          {values.mode === 'transport' && (
            <Field label="Transporter">
              <select className="input" value={values.transporter} onChange={set('transporter')}>
                <option value="">Pick the transporter…</option>
                {plan.transporters.map((row) => <option key={row._id} value={row._id}>{row.name}{row.bookingOffice ? ` · ${row.bookingOffice}` : ''}</option>)}
              </select>
            </Field>
          )}
          {['own_vehicle', 'transport'].includes(values.mode) && (
            <>
              <Field label="Driver">
                <input className="input" value={values.driverName} onChange={set('driverName')} maxLength={80} placeholder="Name" />
              </Field>
              <Field label="Driver's phone">
                <input className="input" inputMode="tel" value={values.driverPhone} onChange={set('driverPhone')} maxLength={20} />
              </Field>
            </>
          )}
        </div>

        <fieldset>
          <legend className="label">Cartons for each stop (optional)</legend>
          <ul className="space-y-1.5">
            {stops.map((stop, index) => (
              <li key={stop.task} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-xs font-bold text-steel-500">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-steel-200">{stop.customer?.name || 'Buyer'}{stop.quantity ? <span className="text-steel-500"> · {Number(stop.quantity).toLocaleString('en-IN')} pcs</span> : null}</span>
                <input type="number" min={0} max={5000} className="input w-24" value={cartons[stop.task] ?? ''} aria-label={`Cartons for ${stop.customer?.name || 'this stop'}`}
                  onChange={(event) => setCartons((current) => ({ ...current, [stop.task]: event.target.value }))} />
              </li>
            ))}
          </ul>
          {total > 0 && (
            <p className={`mt-2 text-sm ${over ? 'font-semibold text-danger-400' : 'text-steel-400'}`}>
              {total} cartons{vehicle?.capacityCartons ? ` of ${vehicle.capacityCartons} this vehicle carries` : ''}{over ? ' — more than it carries; split the trip or pick a bigger vehicle' : ''}
            </p>
          )}
        </fieldset>

        <Field label="Note for the trip (optional)">
          <input className="input" value={values.note} onChange={set('note')} maxLength={500} placeholder="Load from gate 2, collect empty cartons" />
        </Field>

        {problem && <p role="alert" className="text-sm text-danger-400">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Making…' : 'Make trip'}</button>
        </div>
      </form>
    </Modal>
  );
}
