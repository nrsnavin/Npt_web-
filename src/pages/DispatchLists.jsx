import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deliveryRoutesApi, transportersApi, vehiclesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState, ErrorState, Field, Modal, PageHeader, Spinner } from '../components/ui.jsx';

/**
 * The two lists the trip planner groups by [components/TripPlanner.jsx]: the transporters the
 * plant books with (and their booking offices), and its own delivery routes. Kept short and
 * picked from, so one place is never two spellings.
 */

const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];

const KINDS = {
  transporter: {
    api: transportersApi,
    title: 'Transporters',
    one: 'transporter',
    blank: { name: '', bookingOffice: '', phone: '', serves: '', notes: '' },
    fields: [
      { key: 'name', label: 'Name', placeholder: 'KPN Parcel Service' },
      { key: 'bookingOffice', label: 'Booking office / godown', placeholder: 'Tiruppur office, Kumaran Road' },
      { key: 'phone', label: 'Phone', placeholder: '98xxxxxxxx' },
      { key: 'serves', label: 'Goes to', placeholder: 'Bangalore, Hosur, Salem' },
    ],
    line: (row) => [row.bookingOffice, row.serves && `to ${row.serves}`, row.phone].filter(Boolean).join(' · '),
  },
  vehicle: {
    api: vehiclesApi,
    title: 'Vehicles',
    one: 'vehicle',
    titleKey: 'number',
    blank: { number: '', kind: '', capacityCartons: '', driverName: '', driverPhone: '', notes: '' },
    numbers: ['capacityCartons'],
    fields: [
      { key: 'number', label: 'Vehicle number', placeholder: 'TN 39 AB 4521' },
      { key: 'kind', label: 'Type', placeholder: 'Tata Ace, Eicher 14 ft' },
      { key: 'capacityCartons', label: 'Carries (cartons)', placeholder: '80', type: 'number' },
      { key: 'driverName', label: 'Usual driver', placeholder: 'Selvam' },
      { key: 'driverPhone', label: "Driver's phone", placeholder: '98xxxxxxxx' },
    ],
    line: (row) => [row.kind, row.capacityCartons && `${row.capacityCartons} cartons`, row.driverName && `driver ${row.driverName}`, row.driverPhone].filter(Boolean).join(' · '),
  },
  route: {
    api: deliveryRoutesApi,
    title: 'Delivery routes',
    one: 'route',
    blank: { name: '', areas: '', days: [], notes: '' },
    fields: [
      { key: 'name', label: 'Route name', placeholder: 'Route 2 · Avinashi Road' },
      { key: 'areas', label: 'Areas along it', placeholder: 'Anupparpalayam, Kumar Nagar, Old Bus Stand' },
    ],
    line: (row) => [row.areas, row.days?.length && DAYS.filter(([key]) => row.days.includes(key)).map(([, label]) => label).join(' ')].filter(Boolean).join(' · '),
  },
};

function Editor({ kind, row, onClose, onSaved }) {
  const spec = KINDS[kind];
  const [values, setValues] = useState(() => ({ ...spec.blank, ...(row || {}) }));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const toggleDay = (day) => setValues((current) => ({ ...current, days: current.days.includes(day) ? current.days.filter((d) => d !== day) : [...current.days, day] }));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const payload = Object.fromEntries(Object.keys(spec.blank).map((key) => [key, (spec.numbers || []).includes(key) ? (values[key] === '' || values[key] == null ? null : Number(values[key])) : values[key]]));
    try {
      if (row) await spec.api.update({ id: row._id, expectedUpdatedAt: row.updatedAt, ...payload, active: values.active !== false });
      else await spec.api.create(payload);
      onSaved();
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={row ? `Edit ${spec.one}` : `Add a ${spec.one}`}>
      <form onSubmit={save} className="space-y-4">
        {/* The name is the one thing every entry needs. */}
        <Field label={spec.fields[0].label} required>
          <input className="input" value={values[spec.titleKey || 'name'] || ''} onChange={set(spec.titleKey || 'name')} placeholder={spec.fields[0].placeholder} required minLength={2} maxLength={120} />
        </Field>
        {spec.fields.slice(1).map((field) => (
          <Field key={field.key} label={field.label}>
            <input className="input" type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} value={values[field.key] ?? ''} onChange={set(field.key)} placeholder={field.placeholder} maxLength={field.key === 'areas' ? 500 : 200} />
          </Field>
        ))}
        {kind === 'route' && (
          <fieldset>
            <legend className="label">Usually goes on</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={values.days.includes(key)} onClick={() => toggleDay(key)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${values.days.includes(key) ? 'border-accent bg-accent/15 text-accent' : 'border-line/[0.12] text-steel-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <Field label="Notes">
          <input className="input" value={values.notes || ''} onChange={set('notes')} maxLength={500} />
        </Field>
        {row && (
          <label className="flex items-center gap-2 text-sm text-steel-300">
            <input type="checkbox" className="h-4 w-4 accent-flame-500" checked={values.active !== false} onChange={(event) => setValues((current) => ({ ...current, active: event.target.checked }))} />
            In use — offered when planning
          </label>
        )}
        {problem && <p role="alert" className="text-sm text-danger-400">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function List({ kind, canEdit }) {
  const spec = KINDS[kind];
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const load = useCallback(() => spec.api.list().then(setRows).catch(setError), [spec]);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="card space-y-3 p-5" aria-label={spec.title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-steel-50">{spec.title}</h2>
        {canEdit && <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setEditing(null)}>+ Add</button>}
      </div>
      {error && <ErrorState error={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && !rows.length && <EmptyState title={`No ${spec.title.toLowerCase()} yet`} description={`Add the ${spec.title.toLowerCase()} you use, then set them on buyers from Plan trips.`} />}
      {rows?.length > 0 && (
        <ul className="divide-y divide-line/[0.06]">
          {rows.map((row) => (
            <li key={row._id} className={`flex items-start justify-between gap-3 py-2.5 ${row.active === false ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-steel-100">{row[spec.titleKey || 'name']}{row.active === false && <span className="ml-2 text-xs font-normal text-steel-500">not in use</span>}</p>
                <p className="text-xs text-steel-400">{spec.line(row) || '—'}</p>
              </div>
              {canEdit && <button type="button" className="shrink-0 text-xs font-semibold text-accent hover:underline" onClick={() => setEditing(row)}>Edit</button>}
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined && <Editor kind={kind} row={editing} onClose={() => setEditing(undefined)} onSaved={load} />}
    </section>
  );
}

export default function DispatchLists() {
  const { canWrite } = useAuth();
  const canEdit = canWrite('dispatch');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles, transporters & routes"
        subtitle="What the trip planner groups buyers by. Set them on buyers from Plan trips or the customer form."
        actions={<Link to="/dispatch/plan" className="btn-secondary">Plan trips</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <List kind="vehicle" canEdit={canEdit} />
        <List kind="transporter" canEdit={canEdit} />
        <List kind="route" canEdit={canEdit} />
      </div>
    </div>
  );
}
