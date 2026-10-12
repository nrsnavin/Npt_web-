import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QcFlag, { AskLocation } from '../components/QcFlag.jsx';
import { tripsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorState, PageHeader, Spinner } from '../components/ui.jsx';

/**
 * One trip [server: services/trip.service.js]: the stops in the order the vehicle reaches them,
 * what it goes on and who drives, and one big button for the next step —
 *
 *   Planned → Start loading → Left the plant → Trip completed
 *
 * Before it leaves, stops can be moved up or down, have their cartons changed or come off. When it
 * leaves, every request on it is marked Dispatched (Reception gets the LR copies). On the road, each
 * stop is ticked Delivered, or Not delivered with why.
 */

const STATUS = {
  planned: { label: 'Planned', tone: 'bg-line/[0.08] text-steel-300' },
  loading: { label: 'Loading', tone: 'bg-warn-500/15 text-warn-400' },
  left: { label: 'On the road', tone: 'bg-accent/15 text-accent' },
  completed: { label: 'Completed', tone: 'bg-success-500/15 text-success-400' },
  cancelled: { label: 'Cancelled', tone: 'bg-danger-500/15 text-danger-400' },
};
/* The one next step, and the quieter ones beside it. */
const NEXT = {
  planned: { main: ['loading', 'Start loading'], others: [['left', 'Left the plant'], ['cancelled', 'Cancel trip']] },
  loading: { main: ['left', 'Left the plant'], others: [['planned', 'Back to planned'], ['cancelled', 'Cancel trip']] },
  left: { main: ['completed', 'Trip completed'], others: [] },
};
const goesBy = (trip) => {
  if (trip.mode === 'party_collects') return 'Party collects at the gate';
  if (trip.mode === 'courier') return 'Courier';
  if (trip.mode === 'transport') return [trip.transporter?.name, trip.transporter?.bookingOffice].filter(Boolean).join(' · ') || 'Transport booking';
  return [trip.vehicle?.number, trip.vehicle?.kind].filter(Boolean).join(' · ') || 'Our vehicle';
};
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const day = (date) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

function StopRow({ stop, index, count, editable, onTheRoad, onMove, onRemove, onCartons, onTick }) {
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const customer = stop.customer || {};
  const address = [customer.address, customer.area, customer.landmark && `near ${customer.landmark}`, customer.city, customer.pincode].filter(Boolean).join(', ');
  const phone = customer.whatsapp || customer.mobile;
  return (
    <li className="rounded-xl border border-line/[0.08] p-3" data-stop={stop.status}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-steel-50">
            {customer.name || 'Buyer'}
            {stop.enquiry && <Link to={`/enquiries/${stop.enquiry._id}`} className="ml-2 text-xs font-normal text-accent hover:underline">{stop.enquiry.number}</Link>}
          </p>
          {address && <p className="text-sm text-steel-300">{address}</p>}
          <p className="text-xs text-steel-400">{[stop.model, stop.quantity && `${stop.quantity.toLocaleString('en-IN')} pcs`, phone].filter(Boolean).join(' · ')}</p>
          {stop.note && <p className="mt-1 text-xs text-warn-400">{stop.note}</p>}
          {stop.qc && <p className="mt-1"><QcFlag qc={stop.qc} /></p>}
          {editable && customer.site?.lat == null && customer._id && <p className="mt-1"><AskLocation customerId={customer._id} /></p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {editable ? (
            <label className="flex items-center gap-1 text-xs text-steel-400">
              Cartons
              <input type="number" min={0} max={5000} className="input w-20 py-1" defaultValue={stop.cartons ?? ''} aria-label={`Cartons for ${customer.name || 'this stop'}`}
                onBlur={(event) => onCartons(event.target.value === '' ? null : Number(event.target.value))} />
            </label>
          ) : (
            stop.cartons ? <span className="text-xs text-steel-400">{stop.cartons} cartons</span> : null
          )}
          {stop.status !== 'planned' && (
            <span className={`rounded-full px-2 text-xs font-semibold leading-5 ${stop.status === 'delivered' ? 'bg-success-500/15 text-success-400' : 'bg-danger-500/15 text-danger-400'}`}>
              {stop.status === 'delivered' ? 'Delivered' : 'Not delivered'}
            </span>
          )}
        </div>
      </div>
      {editable && (
        <div className="mt-2 flex flex-wrap gap-2 pl-10">
          <button type="button" className="btn-secondary px-2.5 py-1 text-xs" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">↑ Up</button>
          <button type="button" className="btn-secondary px-2.5 py-1 text-xs" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down">↓ Down</button>
          {count > 1 && <button type="button" className="px-2.5 py-1 text-xs font-semibold text-danger-400 hover:underline" onClick={onRemove}>Take off this trip</button>}
        </div>
      )}
      {onTheRoad && stop.status === 'planned' && (
        <div className="mt-2 space-y-2 pl-10">
          {!asking ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => onTick('delivered')}>Delivered</button>
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setAsking(true)}>Not delivered</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input className="input min-w-0 flex-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why — gate closed, buyer away…" maxLength={500} aria-label="Why it was not delivered" />
              <button type="button" className="btn-primary px-3 py-1.5 text-sm" disabled={reason.trim().length < 3} onClick={() => onTick('not_delivered', reason.trim())}>Save</button>
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setAsking(false)}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function TripDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const canEdit = canWrite('dispatch');
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [told, setTold] = useState(null);
  const [askAgain, setAskAgain] = useState(false);

  const load = useCallback(() => tripsApi.get(id).then((data) => { setTrip(data); setError(null); }).catch(setError), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!trip) return <Spinner label="Loading the trip" />;

  const editable = canEdit && ['planned', 'loading'].includes(trip.status);
  const onTheRoad = canEdit && trip.status === 'left';
  const next = canEdit ? NEXT[trip.status] : null;
  const cartons = trip.stops.reduce((sum, stop) => sum + (stop.cartons || 0), 0);
  const capacity = trip.vehicle?.capacityCartons;
  const status = STATUS[trip.status] || { label: trip.status, tone: '' };

  const run = async (work) => {
    setBusy(true);
    try { setTrip(await work()); } catch { /* the toast says what went wrong */ } finally { setBusy(false); }
  };
  /* A new step makes the last telling-the-buyers answer stale; clear it. */
  const move = (status) => { setTold(null); setAskAgain(false); return run(() => tripsApi.status({ id: trip._id, status })); };
  const saveStops = (stops) => run(() => tripsApi.update({ id: trip._id, expectedUpdatedAt: trip.updatedAt, stops }));
  const asStops = (list) => list.map((stop) => ({ id: stop._id, cartons: stop.cartons ?? null }));
  const reorder = (index, step) => {
    const list = [...trip.stops];
    [list[index], list[index + step]] = [list[index + step], list[index]];
    saveStops(asStops(list));
  };
  const tell = async (force = false) => {
    setBusy(true);
    try {
      setTold(await tripsApi.tellBuyers({ id: trip._id, force }));
      setAskAgain(false);
    } catch (failure) {
      if (failure.status === 409) setAskAgain(failure.message);
      else setTold({ error: failure.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${trip.number}`}
        subtitle={`${day(trip.date)}${trip.departAt ? `, ${trip.departAt}` : ''} · ${goesBy(trip)}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => tripsApi.sheet(trip)}>Trip sheet (PDF)</button>
            <Link to="/dispatch/plan" className="btn-secondary">Back to Plan trips</Link>
          </div>
        )}
      />

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${status.tone}`}>{status.label}</span>
          {trip.driverName && <span className="text-sm text-steel-300">Driver: <span className="font-semibold text-steel-100">{trip.driverName}</span>{trip.driverPhone ? ` · ${trip.driverPhone}` : ''}</span>}
          <span className={`text-sm ${capacity && cartons > capacity ? 'font-semibold text-danger-400' : 'text-steel-400'}`}>
            {trip.stops.length} {trip.stops.length === 1 ? 'stop' : 'stops'}{cartons ? ` · ${cartons}${capacity ? ` of ${capacity}` : ''} cartons` : ''}{capacity && cartons > capacity ? ' — over what the vehicle carries' : ''}
          </span>
        </div>
        {trip.note && <p className="text-sm text-steel-300">{trip.note}</p>}

        {next && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary px-5" disabled={busy} onClick={() => move(next.main[0])}>{next.main[1]}</button>
            {next.others.map(([key, label]) => (
              <button key={key} type="button" className={key === 'cancelled' ? 'px-3 py-2 text-sm font-semibold text-danger-400 hover:underline' : 'btn-secondary'} disabled={busy} onClick={() => move(key)}>{label}</button>
            ))}
          </div>
        )}
        {next?.main[0] === 'left' && (
          <p className="text-xs text-steel-400">Left the plant marks every request on this trip Dispatched, and Reception gets each LR copy to send.</p>
        )}

        {canEdit && !['cancelled'].includes(trip.status) && (
          <div className="space-y-2 border-t border-line/[0.06] pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => tell(false)}>
                {['left', 'completed'].includes(trip.status) ? 'Tell buyers it is on the way' : 'Tell buyers when it goes'}
              </button>
              <span className="text-xs text-steel-500">
                {trip.notified?.left ? `Told on the way ${formatDateTime(trip.notified.left)}` : trip.notified?.planned ? `Told the plan ${formatDateTime(trip.notified.planned)}` : 'WhatsApp from the company number, one message per buyer'}
              </span>
            </div>
            {askAgain && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-warn-400">
                {askAgain}
                <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => tell(true)}>Send again</button>
              </div>
            )}
            {told && !told.error && (
              <p className="text-sm text-steel-300">
                Sent to {told.sent} {told.sent === 1 ? 'buyer' : 'buyers'}{told.skipped?.length ? ` · ${told.skipped.length} skipped (no number, or they opted out)` : ''}{told.failed ? ` · ${told.failed} failed` : ''}
              </p>
            )}
            {told?.error && <p className="text-sm text-danger-400">{told.error}</p>}
          </div>
        )}
      </section>

      <section aria-label="Stops" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-steel-50">Stops, in order</h2>
          {editable && trip.stops.filter((stop) => stop.customer?.site?.lat != null).length > 1 && (
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={() => run(() => tripsApi.update({ id: trip._id, expectedUpdatedAt: trip.updatedAt, orderByDistance: true }))}>
              Order by distance from the plant
            </button>
          )}
        </div>
        <ol className="space-y-2">
          {trip.stops.map((stop, index) => (
            <StopRow
              key={stop._id}
              stop={stop}
              index={index}
              count={trip.stops.length}
              editable={editable}
              onTheRoad={onTheRoad}
              onMove={(step) => reorder(index, step)}
              onRemove={() => saveStops(asStops(trip.stops.filter((other) => other._id !== stop._id)))}
              onCartons={(value) => {
                if ((stop.cartons ?? null) === value) return;
                saveStops(asStops(trip.stops.map((other) => (other._id === stop._id ? { ...other, cartons: value } : other))));
              }}
              onTick={(status, note) => run(() => tripsApi.stop({ id: trip._id, stopId: stop._id, status, note }))}
            />
          ))}
        </ol>
      </section>

      {trip.statusHistory?.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-bold text-steel-100">What happened</h2>
          <ul className="space-y-1 text-xs text-steel-400">
            {trip.statusHistory.map((entry, index) => (
              <li key={index}>{formatDateTime(entry.at)} · {STATUS[entry.to]?.label || entry.to}{entry.note ? ` — ${entry.note}` : ''}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
