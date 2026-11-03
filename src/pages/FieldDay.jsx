import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { field } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import useCurrentLocation from '../hooks/useCurrentLocation.js';
import usePreciseLocation from '../hooks/usePreciseLocation.js';
import AttendanceCard from '../components/AttendanceCard.jsx';
import { CheckInButton, CheckedInTimer, gpsWords, visitStatusLabel } from '../components/FieldVisitButton.jsx';
import { Badge, DashboardSkeleton, ErrorState, Modal, Notice, PageHeader, Section } from '../components/ui.jsx';
import { formatDate, isoDay } from '../utils/format.js';
import { accuracyLabel, mapsUrl } from '../utils/maps.js';
import CustomerName from '../components/CustomerName.jsx';

/**
 * My field day [server: fieldVisit.service]: the one screen a person out of the office works
 * from. The day's attendance at the top; the visit they are checked into, with the phone sending a
 * fix every five minutes while this page is open; the visits planned for today (and any carried
 * over) — Check in, or close one they are not making; Plan a visit for themselves or for the
 * people they plan for; Add a visit I made, for one made without the phone, with why.
 *
 * The five-minute fix needs the page open: a browser gives a web app no location while it is in
 * the background, so the day's report says "gaps in tracking" rather than guessing the person
 * left. The check-in and the check-out are what prove the visit; the fixes between show they
 * stayed.
 */
const time = (value) => (value ? new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '');
const minutes = (from, to = new Date()) => Math.max(0, Math.round((new Date(to) - new Date(from)) / 60_000));
const message = (failure) => failure?.response?.data?.message || failure.message;
const TONE = { planned: 'neutral', checked_in: 'progress', completed: 'success', not_completed: 'warn', rescheduled: 'neutral', cancelled: 'neutral' };
/* A moment as a datetime-local field reads it, in the phone's own time zone. */
const local = (value) => new Date(new Date(value).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/**
 * The phone's fix every five minutes while checked in, and whenever the page comes back to the
 * front. A fix that strays [server: fieldVisit.service `ping`] comes back as a discrepancy: the
 * person is told what the phone said and may re-check the GPS on the spot — a precise fix, sent
 * as a re-check, confirms the place. At the server's limit of strikes Admin has been told.
 */
function useStayPings(visit, everyMs, { warn } = {}) {
  const [last, setLast] = useState(null);
  const [discrepancy, setDiscrepancy] = useState(null);
  const [poor, setPoor] = useState(null);
  const sending = useRef(false);
  const precise = usePreciseLocation();
  const took = useCallback((answer) => {
    setLast({ at: new Date(), distanceM: answer.distanceM, accuracyM: answer.accuracyM, flags: answer.flags, count: answer.pings, strikes: answer.strikes, limit: answer.limit });
    /* A fix too poor to judge is said, not held against the person; a rough re-check settles nothing. */
    setPoor(answer.poor ? answer.message : null);
    if (answer.inconclusive) { warn?.('Not close enough to tell', answer.message); return; }
    if (answer.verifiedLater) warn?.('GPS verified', 'A good fix at the place verified your check-in.', 'ok');
    if (answer.discrepancy) {
      setDiscrepancy(answer.discrepancy);
      warn?.('Your location looks off', `${answer.discrepancy.detail} — strike ${answer.discrepancy.strikes} of ${answer.discrepancy.limit}. If you are still at the place, re-check the GPS now.`);
    } else if (answer.confirmed) {
      setDiscrepancy(null);
    }
  }, [warn]);
  const send = useCallback(() => {
    if (!visit?._id || sending.current || typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    sending.current = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        field.ping({ id: visit._id, fix: { lat: position.coords.latitude, lng: position.coords.longitude, accuracyM: position.coords.accuracy, capturedAt: new Date(position.timestamp || Date.now()).toISOString() } })
          .then(took)
          .catch(() => setLast((current) => ({ ...(current || {}), failedAt: new Date() })))
          .finally(() => { sending.current = false; });
      },
      () => { sending.current = false; setLast((current) => ({ ...(current || {}), failedAt: new Date(), noFix: true })); },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 30_000 },
    );
  }, [visit?._id, took]);
  useEffect(() => {
    if (!visit?._id) return undefined;
    const timer = setInterval(send, everyMs || 5 * 60_000);
    const onShow = () => { if (document.visibilityState === 'visible') send(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, [visit?._id, everyMs, send]);
  /* The re-check: a precise fix, never a cached one, sent as such. */
  const { status, fix, reset } = precise;
  const [rechecking, setRechecking] = useState(false);
  useEffect(() => {
    if (status !== 'ready' || !fix || !visit?._id || rechecking) return;
    setRechecking(true);
    field.ping({ id: visit._id, fix, recheck: true })
      .then((answer) => { took(answer); if (answer.confirmed) warn?.('Location confirmed', 'You are at the place — the earlier fix was the phone’s.'); })
      .catch(() => {})
      .finally(() => { setRechecking(false); reset(); });
  }, [status, fix, visit?._id, rechecking, took, warn, reset]);
  useEffect(() => { setDiscrepancy(visit?.tracking?.pendingRecheck ? { ...(visit.tracking.lastDiscrepancy || {}), strikes: visit.tracking.strikes, suspect: Boolean(visit.tracking.suspectAt) } : null); }, [visit?._id, visit?.tracking?.pendingRecheck, visit?.tracking?.strikes, visit?.tracking?.lastDiscrepancy, visit?.tracking?.suspectAt]);
  return { last, discrepancy, poor, recheck: precise.locate, rechecking: rechecking || status === 'locating', precise };
}

/** What came of the visit — the category's outcomes and the details each one needs [config/fieldVisits.js]. */
function CheckOutForm({ visit, config, onDone, onCancel }) {
  const { toast, warn } = useToast();
  const location = useCurrentLocation();
  const outcomes = config.outcomes?.[visit.category] || [];
  const [key, setKey] = useState(outcomes[0]?.key || '');
  const [values, setValues] = useState({});
  const [words, setWords] = useState({ met: '', happened: '', response: '' });
  const [putOff, setPutOff] = useState('');
  const [saving, setSaving] = useState(false);
  const [fix, setFix] = useState(null);
  const chosen = outcomes.find((entry) => entry.key === key);
  useEffect(() => { location.locate(); }, []);
  useEffect(() => { if (location.status === 'ready' && location.fix) setFix(location.fix); }, [location.status, location.fix]);
  const submit = async (event) => {
    event.preventDefault();
    if (!chosen) return;
    setSaving(true);
    try {
      const outcome = { key, ...Object.fromEntries(chosen.fields.map((name) => [name, values[name] ?? ''])) };
      const done = await field.checkOut({ id: visit._id, fix: fix || null, outcome, words, ...(putOff && !chosen.completes ? { reschedule: { date: putOff } } : {}) });
      toast('Checked out', `${done.outcome?.label}${done.outcome?.report?.text ? ` — ${done.outcome.report.text}` : ''}`);
      onDone(done);
    } catch (failure) {
      warn('Not checked out', message(failure));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Check out">
      <p className="text-sm text-steel-300">{visit.purpose} · checked in {time(visit.checkIn?.at)} · {minutes(visit.checkIn?.at)} min</p>
      <fieldset>
        <legend className="label">What came of it?</legend>
        <div className="flex flex-wrap gap-2">
          {outcomes.map((entry) => (
            <button key={entry.key} type="button" onClick={() => setKey(entry.key)} className={`${key === entry.key ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`} aria-pressed={key === entry.key}>{entry.label}</button>
          ))}
        </div>
      </fieldset>
      {chosen?.fields.map((name) => {
        const spec = config.fields?.[name] || { label: name, type: 'text' };
        const required = chosen.required?.includes(name);
        return (
          <label key={name} className="block text-xs text-steel-300">
            {spec.label}{required ? ' *' : ''}
            {spec.type === 'select' ? (
              <select className="input mt-0.5" aria-label={spec.label} value={values[name] || ''} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} required={required}>
                <option value="">Choose…</option>
                {spec.options.map((option) => <option key={option} value={option}>{option.toUpperCase()}</option>)}
              </select>
            ) : (
              <input type={spec.type === 'number' ? 'number' : spec.type === 'date' ? 'date' : 'text'} className="input mt-0.5" aria-label={spec.label} value={values[name] || ''} min={spec.type === 'number' ? 0 : undefined} step={spec.type === 'number' ? '0.01' : undefined} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} required={required} />
            )}
          </label>
        );
      })}
      {chosen?.key === 'collected' && (
        <p className="text-xs text-steel-500">{values.mode === 'cheque' ? 'The cheque number is needed — ' : ''}The money is logged on the buyer’s task for Accounts to confirm; a cheque reads Cheque Collected, cash or a transfer reads Payment Received.</p>
      )}
      {chosen?.key === 'promised' && <p className="text-xs text-steel-500">The task reads Promised and falls due on that day.</p>}
      {chosen?.key === 'delivered' && <p className="text-xs text-steel-500">The sample is recorded as handed over and the Sample Request closes.</p>}
      {chosen?.key === 'met' && <p className="text-xs text-steel-500">Written on the enquiry as a visit; the next follow-up moves to the day you give.</p>}
      {chosen && !chosen.completes && (
        <label className="block text-xs text-steel-300">
          Visit again on (optional)
          <input type="date" className="input mt-0.5" aria-label="Visit again on" value={putOff} min={isoDay(new Date(Date.now() + 86400000))} onChange={(event) => setPutOff(event.target.value)} />
        </label>
      )}
      <div className="space-y-1.5 rounded-lg border border-line/[0.1] p-2.5">
        <p className="text-xs text-steel-400">A few words — any language. Admin and the marketing person get it written up.</p>
        {[['met', 'Who did you meet?'], ['happened', 'What happened?'], ['response', 'What did they say?']].map(([name, label]) => (
          <input key={name} className="input" aria-label={label} placeholder={label} maxLength={1000} value={words[name]} onChange={(event) => setWords((current) => ({ ...current, [name]: event.target.value }))} />
        ))}
      </div>
      <p className="text-xs text-steel-500">
        {location.status === 'locating' ? 'Getting your location…' : fix ? `Location at check-out: ${accuracyLabel(fix.accuracyM)}` : 'No location from the phone — the check-out is kept as not GPS verified.'}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving || !chosen}>{saving ? 'Checking out…' : 'Check out'}</button>
      </div>
    </form>
  );
}

/** A planned visit closed without going: not completed, put off to another day, cancelled — with why. */
function SettleForm({ visit, onDone, onCancel }) {
  const { toast, warn } = useToast();
  const [status, setStatus] = useState('rescheduled');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(isoDay(new Date(Date.now() + 86400000)));
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const done = await field.settle({ id: visit._id, status, reason, ...(status === 'rescheduled' ? { date } : {}) });
      toast(visitStatusLabel(done.status), visit.purpose);
      onDone(done);
    } catch (failure) {
      warn('Not saved', message(failure));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Not making this visit">
      <p className="text-sm text-steel-300">{visit.purpose}</p>
      <div className="flex flex-wrap gap-2">
        {[['rescheduled', 'Put off to another day'], ['not_completed', 'Not completed'], ['cancelled', 'Cancel it']].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setStatus(key)} className={`${status === key ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`} aria-pressed={status === key}>{label}</button>
        ))}
      </div>
      {status === 'rescheduled' && (
        <label className="block text-xs text-steel-300">New day<input type="date" className="input mt-0.5" aria-label="New day" value={date} min={isoDay()} onChange={(event) => setDate(event.target.value)} required /></label>
      )}
      <label className="block text-xs text-steel-300">Why<input className="input mt-0.5" aria-label="Why" value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} /></label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Back</button>
        <button type="submit" className="btn-primary" disabled={saving || !reason.trim()}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

/** Plan a visit: on its own (the bank, a courier), or for a buyer — for me or for the people I plan for. */
function PlanForm({ config, onDone, onCancel }) {
  const { user } = useAuth();
  const { toast, warn } = useToast();
  const me = String(user?.id || user?._id || '');
  const [assignee, setAssignee] = useState(config.people.find((person) => String(person._id) === me)?._id || config.people[0]?._id || '');
  const [category, setCategory] = useState('bank_cash');
  const [purpose, setPurpose] = useState('');
  const [date, setDate] = useState(isoDay());
  const [timeAt, setTimeAt] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const visit = await field.plan({ assignee, category, purpose, date, time: timeAt || undefined });
      toast('Visit planned', `${visit.purpose} · ${formatDate(visit.plannedDate)}`);
      onDone(visit);
    } catch (failure) {
      warn('Visit not planned', message(failure));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Plan a visit">
      <label className="block text-xs text-steel-300">Who visits
        <select className="input mt-0.5" aria-label="Who visits" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
          {config.people.map((person) => <option key={person._id} value={person._id}>{String(person._id) === me ? `${person.name} (me)` : person.name}</option>)}
        </select>
      </label>
      <label className="block text-xs text-steel-300">What kind
        <select className="input mt-0.5" aria-label="What kind of visit" value={category} onChange={(event) => setCategory(event.target.value)}>
          {config.categories.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </select>
      </label>
      <label className="block text-xs text-steel-300">What for
        <input className="input mt-0.5" aria-label="What the visit is for" placeholder="Cash withdrawal — SBI Avinashi Road" value={purpose} onChange={(event) => setPurpose(event.target.value)} required maxLength={300} />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block min-w-0 text-xs text-steel-300">Day<input type="date" className="input mt-0.5" aria-label="Day" value={date} min={isoDay()} onChange={(event) => setDate(event.target.value)} required /></label>
        <label className="block min-w-0 text-xs text-steel-300">Time<input type="time" className="input mt-0.5" aria-label="Time" value={timeAt} onChange={(event) => setTimeAt(event.target.value)} /></label>
      </div>
      <p className="text-xs text-steel-500">A visit for a buyer’s sample or payment is planned from its task — Plan a visit on the queue or the card — so the task carries it.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving || !purpose.trim() || !assignee}>{saving ? 'Planning…' : 'Plan the visit'}</button>
      </div>
    </form>
  );
}

/** A visit made without the phone, entered afterwards with why — never GPS verified, and Admin is told. */
function LateForm({ config, onDone, onCancel }) {
  const { toast, warn } = useToast();
  const [category, setCategory] = useState('others');
  const [purpose, setPurpose] = useState('');
  const [inAt, setInAt] = useState('');
  const [outAt, setOutAt] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState('');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const outcomes = config.outcomes?.[category] || [];
  const chosen = outcomes.find((entry) => entry.key === key) || outcomes[0];
  const submit = async (event) => {
    event.preventDefault();
    if (!chosen) return;
    setSaving(true);
    try {
      const outcome = { key: chosen.key, ...Object.fromEntries(chosen.fields.map((name) => [name, values[name] ?? ''])) };
      const visit = await field.late({ category, purpose, checkInAt: new Date(inAt).toISOString(), checkOutAt: new Date(outAt).toISOString(), reason, outcome });
      toast('Visit entered', 'Kept as entered later — not GPS verified. Admin is told.');
      onDone(visit);
    } catch (failure) {
      warn('Not entered', message(failure));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Add a visit I made">
      <Notice tone="warn">Entered later: the visit is kept without GPS verification and Admin is told. Use it only when the phone could not be used at the place.</Notice>
      <label className="block text-xs text-steel-300">What kind
        <select className="input mt-0.5" aria-label="What kind of visit" value={category} onChange={(event) => { setCategory(event.target.value); setKey(''); setValues({}); }}>
          {config.categories.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </select>
      </label>
      <label className="block text-xs text-steel-300">What for<input className="input mt-0.5" aria-label="What the visit was for" value={purpose} onChange={(event) => setPurpose(event.target.value)} required maxLength={300} /></label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block min-w-0 text-xs text-steel-300">Arrived<input type="datetime-local" className="input mt-0.5" aria-label="Arrived at" value={inAt} max={local(new Date())} onChange={(event) => setInAt(event.target.value)} required /></label>
        <label className="block min-w-0 text-xs text-steel-300">Left<input type="datetime-local" className="input mt-0.5" aria-label="Left at" value={outAt} max={local(new Date())} onChange={(event) => setOutAt(event.target.value)} required /></label>
      </div>
      <fieldset>
        <legend className="label">What came of it?</legend>
        <div className="flex flex-wrap gap-2">
          {outcomes.map((entry) => <button key={entry.key} type="button" onClick={() => setKey(entry.key)} className={`${chosen?.key === entry.key ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`} aria-pressed={chosen?.key === entry.key}>{entry.label}</button>)}
        </div>
      </fieldset>
      {chosen?.fields.map((name) => {
        const spec = config.fields?.[name] || { label: name, type: 'text' };
        return (
          <label key={name} className="block text-xs text-steel-300">{spec.label}{chosen.required?.includes(name) ? ' *' : ''}
            {spec.type === 'select'
              ? <select className="input mt-0.5" aria-label={spec.label} value={values[name] || ''} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}><option value="">Choose…</option>{spec.options.map((option) => <option key={option} value={option}>{option.toUpperCase()}</option>)}</select>
              : <input type={spec.type === 'number' ? 'number' : spec.type === 'date' ? 'date' : 'text'} className="input mt-0.5" aria-label={spec.label} value={values[name] || ''} onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))} />}
          </label>
        );
      })}
      <label className="block text-xs text-steel-300">Why is it entered later?<input className="input mt-0.5" aria-label="Why is it entered later" value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={500} placeholder="Phone battery was dead" /></label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Entering…' : 'Enter the visit'}</button>
      </div>
    </form>
  );
}

/** One visit on the list: what, for whom, its state, and what the person can do with it now. */
function VisitRow({ visit, me, onCheckedIn, onCheckOut, onSettle }) {
  const mine = String(visit.user?._id || visit.user) === me;
  const open = visit.status === 'planned';
  return (
    <li className="rounded-xl border border-line/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-steel-50">
            {visit.purpose}
            {visit.customer?.name && <span className="font-normal text-steel-400"> · <CustomerName name={visit.customer.name} /></span>}
          </p>
          <p className="mt-0.5 text-xs text-steel-400">
            {visit.category.replace(/_/g, ' ')} · {formatDate(visit.plannedDate)}{visit.plannedTime ? ` ${visit.plannedTime}` : ''}
            {!mine && visit.user?.name ? ` · ${visit.user.name}` : ''}
            {visit.assignedBy?.name && String(visit.assignedBy._id) !== me ? ` · planned by ${visit.assignedBy.name}` : ''}
            {visit.task?.title && visit.task.title !== visit.purpose ? ` · ${visit.task.title}` : ''}
            {visit.reschedules ? ` · put off ${visit.reschedules}×` : ''}
          </p>
          {visit.checkIn?.at && (
            <p className="mt-0.5 text-xs text-steel-300">
              In {time(visit.checkIn.at)}{visit.checkOut?.at ? ` · out ${time(visit.checkOut.at)} · ${minutes(visit.checkIn.at, visit.checkOut.at)} min` : ''}
              {visit.checkIn.place?.name ? ` · ${visit.checkIn.place.name}` : ''}
              {visit.checkIn.lat != null && <> · <a href={mapsUrl(visit.checkIn)} target="_blank" rel="noreferrer" className="text-accent hover:underline">Map</a></>}
              {` · ${gpsWords(visit.checkIn)}`}
            </p>
          )}
          {visit.outcome?.label && (
            <p className="mt-0.5 text-xs text-steel-200">
              {visit.outcome.label}{visit.outcome.amount ? ` · ₹${visit.outcome.amount}` : ''}{visit.outcome.committedDate ? ` · promised ${formatDate(visit.outcome.committedDate)}` : ''}{visit.outcome.reason ? ` · ${visit.outcome.reason}` : ''}{visit.outcome.receivedBy ? ` · received by ${visit.outcome.receivedBy}` : ''}{visit.outcome.metWhom ? ` · met ${visit.outcome.metWhom}` : ''}
              {visit.outcome.report?.text ? <span className="block text-steel-400">{visit.outcome.report.text}</span> : null}
            </p>
          )}
          {visit.settled?.reason && <p className="mt-0.5 text-xs text-steel-400">{visit.settled.reason}</p>}
          {visit.flags?.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{visit.flags.map((entry) => <Badge key={entry.key} tone="warn">{entry.label}</Badge>)}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone={TONE[visit.status]}>{visitStatusLabel(visit.status)}</Badge>
          {mine && open && <CheckInButton visitId={visit._id} onDone={onCheckedIn} />}
          {mine && visit.status === 'checked_in' && <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => onCheckOut(visit)}>Check out</button>}
          {open && <button type="button" className="text-xs text-steel-400 hover:text-accent hover:underline" onClick={() => onSettle(visit)}>Not making this visit</button>}
        </div>
      </div>
    </li>
  );
}

export default function FieldDay() {
  const { user } = useAuth();
  const me = String(user?.id || user?._id || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => field.me().then((mine) => { setData(mine); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  const { toast, warn } = useToast();
  const { last: pings, discrepancy, poor, recheck, rechecking, precise } = useStayPings(data?.checkedIn, data?.rules?.pingEveryMs, { warn: (title, body, tone) => (tone === 'ok' || title === 'Location confirmed' ? toast(title, body) : warn(title, body)) });
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <DashboardSkeleton label="Loading your field day" tiles={2} />;
  const { marks, checkedIn, visits, carried, people } = data;
  const mayPlan = people.length > 0;
  const refresh = () => { load(); setDialog(null); };
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="My field day"
        subtitle={marks.allowed ? 'Start field duty, check in at every place, say what came of it, end the day.' : 'Your attendance today.'}
        actions={(
          <div className="flex flex-wrap gap-2">
            {mayPlan && <button type="button" className="btn-secondary py-1.5" onClick={() => setDialog({ kind: 'plan' })}>Plan a visit</button>}
            {marks.allowed && <button type="button" className="btn-secondary py-1.5" onClick={() => setDialog({ kind: 'late' })}>Add a visit I made</button>}
            {(marks.mayAssign || user?.role === 'admin') && <Link to="/field/team" className="btn-secondary py-1.5">Field today</Link>}
          </div>
        )}
      />

      <AttendanceCard mine={data} onChanged={setData} link={false} />

      {checkedIn && (
        <section className="card border-l-4 border-l-aqua-500 p-4" aria-label="Checked in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-steel-50">Checked in at “{checkedIn.purpose}”</p>
              <p className="mt-0.5 text-xs text-steel-400">
                Since {time(checkedIn.checkIn?.at)} · <CheckedInTimer since={checkedIn.checkIn?.at} className="font-semibold text-steel-100" />
                {checkedIn.checkIn?.place?.name ? ` · ${checkedIn.checkIn.place.name}` : ''}
                {pings?.at ? ` · last fix ${time(pings.at)}${pings.distanceM != null ? `, ${pings.distanceM} m from where you checked in` : ''}` : ' · the phone sends your location every 5 minutes while this page is open'}
                {pings?.failedAt && !pings?.at ? ' · the last fix could not be sent' : ''}
              </p>
            </div>
            <button type="button" className="btn-primary" onClick={() => setDialog({ kind: 'out', visit: checkedIn })}>Check out</button>
          </div>
          {/* A fix too poor to judge: said, never a strike [server: fieldVisit.service `ping`]. */}
          {poor && !discrepancy && <p className="mt-2 rounded-lg bg-line/[0.05] px-2.5 py-2 text-xs text-steel-300" role="status">{poor}</p>}
          {/* A fix that strayed: what the phone said, and the re-check on the spot [server: fieldVisit.service `ping`]. */}
          {discrepancy && (
            <div className="mt-3 rounded-lg border border-warn-500/40 bg-warn-500/10 p-3 text-sm text-warn-400" role="alert" aria-label="GPS discrepancy">
              <p className="font-semibold">Your location looks off — {discrepancy.detail}{discrepancy.strikes ? ` (strike ${discrepancy.strikes} of ${discrepancy.limit || data.rules?.suspectStrikes || 5})` : ''}.</p>
              <p className="mt-0.5 text-xs">If you are still at the place, stand in the open and re-check the GPS now. {discrepancy.suspect ? 'Admin and whoever planned this visit have been told something is wrong with it.' : 'Repeated strays bring the visit to Admin’s notice.'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={recheck} disabled={rechecking}>{rechecking ? 'Checking the GPS…' : 'Re-check GPS now'}</button>
                {precise.status === 'rough' && <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={precise.accept}>Send it anyway ({accuracyLabel(precise.fix.accuracyM)})</button>}
                {precise.status === 'locating' && precise.best && <span className="text-xs">{accuracyLabel(precise.best.accuracyM)} so far…</span>}
              </div>
            </div>
          )}
        </section>
      )}

      {marks.allowed && !checkedIn && visits.length + carried.length === 0 && (
        <Notice tone="info">No visits planned for today. {mayPlan ? 'Plan one above, or ' : 'A visit for a buyer is planned from its task — '}Plan a visit on the Sampling queue or the PRT card.</Notice>
      )}

      {carried.length > 0 && (
        <Section title={`Carried over (${carried.length})`}>
          <ul className="space-y-2">{carried.map((visit) => <VisitRow key={visit._id} visit={visit} me={me} onCheckedIn={refresh} onCheckOut={(row) => setDialog({ kind: 'out', visit: row })} onSettle={(row) => setDialog({ kind: 'settle', visit: row })} />)}</ul>
        </Section>
      )}
      {visits.length > 0 && (
        <Section title={`Today’s visits (${visits.length})`}>
          <ul className="space-y-2">{visits.map((visit) => <VisitRow key={visit._id} visit={visit} me={me} onCheckedIn={refresh} onCheckOut={(row) => setDialog({ kind: 'out', visit: row })} onSettle={(row) => setDialog({ kind: 'settle', visit: row })} />)}</ul>
        </Section>
      )}

      <p className="text-xs text-steel-500">
        Check in within 10 m of the gate when the phone can — a rougher fix is kept as approximate. Field duty ends only once every visit of the day is checked out, marked not completed or put off. Office days: Punch in / Punch out.
      </p>

      <Modal open={dialog?.kind === 'out'} title="Check out" onClose={() => setDialog(null)}>
        {dialog?.kind === 'out' && <CheckOutForm visit={dialog.visit} config={data} onDone={refresh} onCancel={() => setDialog(null)} />}
      </Modal>
      <Modal open={dialog?.kind === 'settle'} title="Not making this visit" onClose={() => setDialog(null)}>
        {dialog?.kind === 'settle' && <SettleForm visit={dialog.visit} onDone={refresh} onCancel={() => setDialog(null)} />}
      </Modal>
      <Modal open={dialog?.kind === 'plan'} title="Plan a visit" onClose={() => setDialog(null)}>
        {dialog?.kind === 'plan' && <PlanForm config={data} onDone={refresh} onCancel={() => setDialog(null)} />}
      </Modal>
      <Modal open={dialog?.kind === 'late'} title="Add a visit I made" onClose={() => setDialog(null)}>
        {dialog?.kind === 'late' && <LateForm config={data} onDone={refresh} onCancel={() => setDialog(null)} />}
      </Modal>
    </div>
  );
}
