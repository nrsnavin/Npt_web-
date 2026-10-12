import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dispatchPlanning } from '../api/endpoints.js';
import MakeTripDialog from './MakeTripDialog.jsx';
import SuggestTrips from './SuggestTrips.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState, ErrorState, Field, Modal, Spinner } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * Plan trips [server: services/dispatchPlanning.service.js]. The open dispatch requests whose
 * goods can go, already put into groups that can travel together — by transporter, by delivery
 * route, by landmark, area or PIN — each saying in plain words why it is a group. The person at
 * the desk ticks who goes, picks a schedule, and presses one button.
 *
 * Built for someone on their first day: one screen, read left to right; nothing to type that can
 * be picked; and what is not ready, or still owes money, kept out of the way with the reason.
 */

const MODES = [
  { key: 'all', label: 'All' },
  { key: 'transport', label: 'Transport booking' },
  { key: 'own_vehicle', label: 'Our vehicle' },
  { key: 'party_collects', label: 'Party collects' },
  { key: 'courier', label: 'Courier' },
];
const MODE_OPTIONS = MODES.filter((mode) => mode.key !== 'all');
const SCHEDULE_NAMES = ['Top Most Urgent', 'Today', 'Today Evening', 'Tomorrow First', 'Tomorrow'];
const pcs = (value) => (value ? `${Number(value).toLocaleString('en-IN')} pcs` : null);

function Stop({ stop, index, checked, onToggle, canPlan }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-line/[0.06] px-3 py-2 text-sm">
      {canPlan ? (
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-flame-500"
          checked={checked}
          onChange={onToggle}
          aria-label={`Include ${stop.customer?.name || 'this buyer'}`}
        />
      ) : (
        <span className="mt-0.5 w-4 shrink-0 text-xs font-bold text-steel-500">{index + 1}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-steel-100">
          {stop.customer?.name || 'Unknown buyer'}
          {stop.enquiry && (
            <Link to={`/enquiries/${stop.enquiry._id}`} className="ml-2 text-xs font-normal text-accent hover:underline">{stop.enquiry.number}</Link>
          )}
        </p>
        {stop.address && <p className="text-xs text-steel-300">{stop.address}</p>}
        <p className="text-xs text-steel-400">
          {[stop.model, pcs(stop.quantity), stop.statusLabel, stop.due && `due ${formatDate(stop.due)}`, stop.customer?.phone].filter(Boolean).join(' · ')}
        </p>
      </div>
      {stop.urgency < SCHEDULE_NAMES.length && (
        <span className={`shrink-0 rounded-full px-2 text-xs font-semibold leading-5 ${stop.urgency <= 1 ? 'bg-danger-500/15 text-danger-400' : 'bg-warn-500/15 text-warn-400'}`}>
          {SCHEDULE_NAMES[stop.urgency]}
        </span>
      )}
    </li>
  );
}

function GroupCard({ group, schedules, canPlan, onSchedule, onDetails, onMakeTrip }) {
  const [picked, setPicked] = useState(() => new Set(group.stops.map((stop) => String(stop.task))));
  const [schedule, setSchedule] = useState('');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [onlyWhen, setOnlyWhen] = useState(false);
  useEffect(() => { setPicked(new Set(group.stops.map((stop) => String(stop.task)))); }, [group]);

  const chosen = group.stops.filter((stop) => picked.has(String(stop.task)));
  const toggle = (id) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const go = async () => {
    if (!schedule || !chosen.length) return;
    setBusy(true);
    try {
      await onSchedule({ tasks: chosen.map((stop) => stop.task), status: schedule, note: remark.trim() || undefined });
      setSchedule('');
      setRemark('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={group.label}
      data-group={group.by}
      className={`flex flex-col rounded-xl border p-4 ${group.needsDetails ? 'border-warn-500/40 bg-warn-500/[0.05]' : group.stops.length > 1 ? 'border-accent/40 bg-accent/[0.04]' : 'border-line/[0.1]'}`}
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold text-steel-50">{group.label}</h3>
          <span className="rounded-full border border-line/[0.12] px-2 text-xs font-semibold leading-5 text-steel-300">{group.modeLabel}</span>
        </div>
        <p className={`text-sm ${group.needsDetails ? 'text-warn-400' : 'text-steel-300'}`}>{group.reason}</p>
        <p className="text-xs text-steel-400">
          {group.totals.stops} {group.totals.stops === 1 ? 'buyer' : 'buyers'}
          {group.totals.quantity ? ` · ${pcs(group.totals.quantity)}` : ''}
          {group.stops.length > 1 && !group.needsDetails && group.mode === 'transport' ? ' · one drop at the booking office' : ''}
          {group.stops.length > 1 && !group.needsDetails && group.mode === 'own_vehicle' ? ' · one vehicle' : ''}
          {group.orderedByDistance ? ' · in route order by map pins' : ''}
        </p>
        {group.nearby?.length > 0 && (
          <p className="text-xs text-accent">Near: {group.nearby.map((other) => `${other.label} (${other.km} km)`).join(' · ')} — could share the vehicle</p>
        )}
      </header>

      <ul className="mt-3 space-y-2">
        {group.stops.map((stop, index) => (
          <Stop key={stop.task} stop={stop} index={index} canPlan={canPlan} checked={picked.has(String(stop.task))} onToggle={() => toggle(String(stop.task))} />
        ))}
      </ul>

      {canPlan && (
        <div className="mt-3 space-y-2 border-t border-line/[0.06] pt-3">
          {group.needsDetails ? (
            <>
              <button type="button" className="btn-primary w-full" onClick={() => onDetails(group.stops)}>Fix now — add how these go</button>
              {/* The trip can still go today; the dialog asks for what is missing. */}
              <button type="button" className="btn-secondary w-full" disabled={!chosen.length} onClick={() => onMakeTrip(group, chosen)}>Make trip anyway</button>
            </>
          ) : (
            <>
              <button type="button" className="btn-primary w-full" disabled={!chosen.length} onClick={() => onMakeTrip(group, chosen)}>
                {`Make trip${chosen.length !== group.stops.length ? ` with ${chosen.length}` : ''}`}
              </button>
              {!onlyWhen && (
                <button type="button" className="text-xs font-semibold text-steel-400 hover:text-accent hover:underline" onClick={() => setOnlyWhen(true)}>
                  or only set when they go, without a trip
                </button>
              )}
              {onlyWhen && (
              <div className="flex flex-wrap gap-2">
                <select
                  className="input min-w-0 flex-1"
                  value={schedule}
                  onChange={(event) => setSchedule(event.target.value)}
                  aria-label={`Schedule for ${group.label}`}
                >
                  <option value="">Pick when they go…</option>
                  {schedules.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                </select>
                <button type="button" className="btn-secondary" disabled={!schedule || !chosen.length || busy} onClick={go}>
                  {busy ? 'Saving…' : `Schedule ${chosen.length === group.stops.length ? (chosen.length === 1 ? 'it' : 'all') : chosen.length}`}
                </button>
              </div>
              )}
              {onlyWhen && schedule && (
                <input
                  className="input"
                  value={remark}
                  maxLength={500}
                  onChange={(event) => setRemark(event.target.value)}
                  placeholder="Remark (optional) — vehicle, driver, time"
                  aria-label="Remark for this schedule"
                />
              )}
            </>
          )}
          <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => onDetails(chosen.length ? chosen : group.stops)}>
            Change how these buyers' goods go
          </button>
        </div>
      )}
    </section>
  );
}

/** How a set of buyers' goods travel — set once, used for every request after. */
function DeliveryDetails({ open, stops, plan, onClose, onSaved }) {
  const [values, setValues] = useState({ deliveryMode: '', usualTransporter: '', deliveryRoute: '', area: '', landmark: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setValues({ deliveryMode: '', usualTransporter: '', deliveryRoute: '', area: '', landmark: '' }); setProblem(null); } }, [open]);
  const buyers = [...new Map((stops || []).filter((stop) => stop.customer).map((stop) => [String(stop.customer._id), stop.customer])).values()];
  const one = buyers.length === 1;
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const save = async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
    if (!Object.keys(payload).length) return setProblem('Pick at least one thing to set.');
    setBusy(true);
    try {
      await dispatchPlanning.customerDelivery({ customers: buyers.map((buyer) => buyer._id), ...payload });
      onSaved();
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
    return null;
  };

  return (
    <Modal open={open} onClose={onClose} title="How these goods go" description={one ? buyers[0]?.name : `${buyers.length} buyers — what you pick is set on all of them; blanks are left as they are.`}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Usually goes by">
          <select className="input" value={values.deliveryMode} onChange={set('deliveryMode')}>
            <option value="">Leave as it is</option>
            {MODE_OPTIONS.map((mode) => <option key={mode.key} value={mode.key}>{mode.label}</option>)}
          </select>
        </Field>
        <Field label="Usual transporter" hint={plan.transporters.length ? 'For transport bookings — buyers with the same transporter go in one drop.' : 'No transporters on the list yet — add them under Transporters & routes.'}>
          <select className="input" value={values.usualTransporter} onChange={set('usualTransporter')}>
            <option value="">Leave as it is</option>
            {plan.transporters.map((row) => <option key={row._id} value={row._id}>{row.name}{row.bookingOffice ? ` · ${row.bookingOffice}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Delivery route" hint={plan.routes.length ? 'For our own vehicle — everyone on a route is planned together.' : 'No routes on the list yet — add them under Transporters & routes.'}>
          <select className="input" value={values.deliveryRoute} onChange={set('deliveryRoute')}>
            <option value="">Leave as it is</option>
            {plan.routes.map((row) => <option key={row._id} value={row._id}>{row.name}{row.areas ? ` — ${row.areas}` : ''}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Area">
            <input className="input" value={values.area} onChange={set('area')} placeholder="Kumar Nagar" maxLength={120} />
          </Field>
          <Field label="Landmark" hint={one ? undefined : 'Usually one buyer at a time'}>
            <input className="input" value={values.landmark} onChange={set('landmark')} placeholder="Near the bus stop" maxLength={160} />
          </Field>
        </div>
        {problem && <p role="alert" className="text-sm text-danger-400">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

const TRIP_STATUS = {
  cancelled: ['Cancelled', 'bg-danger-500/15 text-danger-400'],
  planned: ['Planned', 'bg-line/[0.08] text-steel-300'],
  loading: ['Loading', 'bg-warn-500/15 text-warn-400'],
  left: ['On the road', 'bg-accent/15 text-accent'],
  completed: ['Completed', 'bg-success-500/15 text-success-400'],
};

/** The trips made from the plan: still to go, on the road, and those finished today. */
export function TripsLane({ trips, today, title = 'Trips' }) {
  if (!trips.length) return null;
  const when = (date) => (date === today ? 'Today' : new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));
  return (
    <section aria-label="Trips" className="space-y-2">
      <h2 className="text-sm font-bold text-steel-100">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {trips.map((trip) => {
          const [label, tone] = TRIP_STATUS[trip.status] || [trip.status, ''];
          return (
            <Link key={trip._id} to={`/dispatch/trips/${trip._id}`} data-trip={trip.status} className="block rounded-xl border border-line/[0.1] p-3 hover:border-accent/50 hover:bg-accent/[0.03]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-steel-50">{trip.number}</span>
                <span className={`rounded-full px-2 text-xs font-semibold leading-5 ${tone}`}>{label}</span>
              </div>
              <p className="text-sm text-steel-200">{trip.goesBy}</p>
              <p className="text-xs text-steel-400">
                {[`${when(trip.date)}${trip.departAt ? `, ${trip.departAt}` : ''}`, trip.driver && `driver ${trip.driver}`].filter(Boolean).join(' · ')}
              </p>
              <p className={`mt-1 text-xs ${trip.over ? 'font-semibold text-danger-400' : 'text-steel-400'}`}>
                {trip.stops} {trip.stops === 1 ? 'stop' : 'stops'}{trip.status === 'left' ? ` · ${trip.delivered} delivered` : ''}
                {trip.cartons ? ` · ${trip.cartons}${trip.capacity ? ` / ${trip.capacity}` : ''} cartons` : ''}{trip.over ? ' — over capacity' : ''}
              </p>
              {trip.buyers.length > 0 && <p className="truncate text-xs text-steel-500">{trip.buyers.join(', ')}</p>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function WaitingList({ title, rows, tone }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return (
    <section className="rounded-xl border border-line/[0.08]">
      <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="text-sm font-bold text-steel-100">{title} <span className={`ml-1 rounded-full px-2 text-xs ${tone}`}>{rows.length}</span></span>
        <span className="text-xs text-steel-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul className="space-y-2 px-4 pb-4">
          {rows.map((row) => (
            <li key={row.task} className="rounded-lg border border-line/[0.06] px-3 py-2 text-sm">
              <p className="font-semibold text-steel-100">
                {row.customer?.name || 'Unknown buyer'}
                {row.enquiry && <Link to={`/enquiries/${row.enquiry._id}`} className="ml-2 text-xs font-normal text-accent hover:underline">{row.enquiry.number}</Link>}
              </p>
              <p className="text-xs text-steel-400">{[row.why, pcs(row.quantity), row.due && `due ${formatDate(row.due)}`].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function TripPlanner() {
  const { canWrite } = useAuth();
  const canPlan = canWrite('dispatch');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('all');
  const [details, setDetails] = useState(null);
  const [making, setMaking] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => dispatchPlanning.plan().then((data) => { setPlan(data); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => (plan?.groups || []).filter((group) => mode === 'all' || group.mode === mode), [plan, mode]);
  const countFor = (key) => (plan?.groups || []).filter((group) => key === 'all' || group.mode === key).reduce((sum, group) => sum + group.stops.length, 0);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!plan) return <Spinner label="Putting the requests into groups" />;
  plan.vehicles ||= [];

  const schedule = async (payload) => {
    await dispatchPlanning.schedule(payload);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-steel-300">
          <span className="font-bold text-steel-50">{plan.counts.ready} ready to plan</span>
          {plan.counts.waitingPayment > 0 && <> · {plan.counts.waitingPayment} waiting for payment</>}
          {plan.counts.notReady > 0 && <> · {plan.counts.notReady} not ready yet</>}
          {plan.counts.needsDetails > 0 && <> · <span className="text-warn-400">{plan.counts.needsDetails} need delivery details</span></>}
        </p>
        <div className="flex items-center gap-3">
          {plan.coverage.customers > 0 && (
            <span className="text-xs text-steel-400" title="Buyers the planner can place without guessing — with a route, transporter, landmark or area">
              {plan.coverage.placed} of {plan.coverage.customers} buyers have delivery details
            </span>
          )}
          {canPlan && plan.groups.some((group) => !group.needsDetails) && (
            <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setSuggesting(true)}>Suggest trips</button>
          )}
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={load}>Refresh</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="How the goods go">
        {MODES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={mode === entry.key}
            onClick={() => setMode(entry.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${mode === entry.key ? 'border-accent bg-accent/15 text-accent' : 'border-line/[0.12] text-steel-300 hover:bg-line/[0.05]'}`}
          >
            {entry.label} <span className="ml-1 text-steel-400">{countFor(entry.key)}</span>
          </button>
        ))}
      </div>

      {groups.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((group) => (
            <GroupCard key={group.key} group={group} schedules={plan.schedules} canPlan={canPlan} onSchedule={schedule} onDetails={setDetails} onMakeTrip={(group, stops) => setMaking({ group, stops })} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={plan.groups.length ? 'Nothing goes this way right now' : 'Nothing ready to plan'}
          description={plan.groups.length ? 'Pick another way above.' : 'When marketing sends a dispatch request and the goods are ready, it appears here in a group.'}
        />
      )}

      <TripsLane trips={plan.trips || []} today={plan.today} />

      <WaitingList title="Waiting for payment" rows={plan.waitingPayment} tone="bg-warn-500/15 text-warn-400" />
      <WaitingList title="Not ready yet" rows={plan.notReady} tone="bg-line/[0.08] text-steel-300" />

      <DeliveryDetails open={Boolean(details)} stops={details} plan={plan} onClose={() => setDetails(null)} onSaved={load} />
      <SuggestTrips open={suggesting} onClose={() => setSuggesting(false)} onMade={load} />
      <MakeTripDialog
        open={Boolean(making)}
        group={making?.group}
        stops={making?.stops || []}
        plan={plan}
        onClose={() => setMaking(null)}
        onMade={(trip) => navigate(`/dispatch/trips/${trip._id}`)}
      />
    </div>
  );
}
