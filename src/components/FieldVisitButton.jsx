import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { field } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import usePreciseLocation from '../hooks/usePreciseLocation.js';
import { pressLabel } from './TaskVisits.jsx';
import { formatDate, isoDay } from '../utils/format.js';
import { accuracyLabel } from '../utils/maps.js';

/** The fix's tiers, as the server grades them [config/fieldVisits.js FIELD_RULES]. */
export const GPS_TIERS = { preciseM: 10, acceptableM: 50 };
const timeOf = (value) => (value ? new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '');
/** How the check-in's GPS reads on every list: verified, verified later, approximate, or not verified with why. */
export const gpsWords = (checkIn) => {
  if (!checkIn?.at) return '';
  if (checkIn.verifiedLaterAt) return `GPS verified later (${timeOf(checkIn.verifiedLaterAt)})`;
  if (checkIn.verified) return 'GPS verified';
  if (checkIn.grade === 'approximate') return `GPS approximate (±${checkIn.accuracyM} m)`;
  return `GPS not verified${checkIn.reason ? ` — ${checkIn.reason}` : ''}`;
};

/**
 * Field visits on a task [server: fieldVisit.service]: the task kinds a visit is planned from.
 * Sampling's sample delivery, the payment teams' collection calls.
 */
export const FIELD_TASK_KINDS = ['sample_request', 'prt_recovery', 'request_prt_visit', 'team_payment_followup', 'my_payment_followup'];

const STATUS_WORDS = { planned: 'Visit planned', checked_in: 'Checked in', completed: 'Visited', not_completed: 'Not completed', rescheduled: 'Put off', cancelled: 'Cancelled' };
export const visitStatusLabel = (status) => STATUS_WORDS[status] || status;

/**
 * Check in at the gate: the precise fix [hooks/usePreciseLocation.js], then the visit is checked
 * into — the day starts if it has not, and the task gets the visit with its satellite picture.
 */
export function useCheckIn(visitId, { onDone } = {}) {
  const { toast, warn } = useToast();
  const location = usePreciseLocation();
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const { status, fix, reset } = location;
  const send = useCallback((sent, why) => {
    if (saving || !visitId) return;
    setSaving(true);
    field.checkIn({ id: visitId, fix: sent || null, ...(why?.trim() ? { reason: why.trim() } : {}), device: navigator.userAgent?.slice(0, 120) })
      .then((visit) => {
        toast('Checked in', `${visit.purpose} · ${visit.checkIn?.place?.name || ''} · ${gpsWords(visit.checkIn)}${!visit.checkIn?.verified && visit.checkIn?.grade !== 'approximate' ? ' — a good fix while you are there will verify it' : ''}`);
        onDone?.(visit);
      })
      .catch((failure) => warn('Not checked in', failure?.response?.data?.message || failure.message))
      .finally(() => { setSaving(false); setReason(''); reset(); });
  }, [saving, visitId, onDone, toast, warn, reset]);
  /* A precise fix goes at once; a rough one waits for the person's say-so [CheckInPrecision]. */
  useEffect(() => {
    if (status !== 'ready' || !fix || saving) return;
    send(fix, fix.accuracyM > GPS_TIERS.acceptableM ? reason : '');
  }, [status, fix, saving, send, reason]);
  /* No fix at all: checked in with why, for a later fix to verify. */
  const withoutGps = useCallback((why) => send(null, why), [send]);
  return { ...location, saving, busy: saving || status === 'locating', reason, setReason, withoutGps };
}

/**
 * What the phone is doing, and what to do when it cannot get under 10 m [server: fieldVisit.service
 * `checkIn`]: within 50 m is near enough — recorded as approximate, nothing said to Admin; rougher
 * than that, or no fix at all, the person says why and checks in as it is — a precise fix while they
 * are there verifies it after the fact.
 */
export function CheckInPrecision({ recorder }) {
  const { status, best, fix, message, targetM, locate, accept, reset, reason, setReason, withoutGps, saving } = recorder;
  if (status === 'locating') {
    return <p className="text-xs text-aqua-300" aria-live="polite">{best ? `${accuracyLabel(best.accuracyM)} so far — waiting for under ${targetM} m…` : 'Waiting for the satellites…'} Stand in the open, away from walls and roofs.</p>;
  }
  if (status === 'rough') {
    const near = fix.accuracyM <= GPS_TIERS.acceptableM;
    return (
      <div className="space-y-1.5 rounded-lg bg-warn-500/10 px-2.5 py-2 text-xs text-warn-400" role="status">
        <p>{near ? `The closest the phone got was ${accuracyLabel(fix.accuracyM)} — near enough: it is kept as approximate.` : message}</p>
        {!near && (
          <input className="input" aria-label="Why the GPS could not get closer" placeholder="Why — inside the office, basement, no window" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={locate}>Try again</button>
          <button type="button" className="btn-primary px-2.5 py-1 text-xs" onClick={accept} disabled={saving || (!near && reason.trim().length < 3)}>{near ? `Check in (${accuracyLabel(fix.accuracyM)})` : `Check in as it is (${accuracyLabel(fix.accuracyM)})`}</button>
          <button type="button" className="text-xs text-steel-400 hover:underline" onClick={reset}>Cancel</button>
        </div>
        {!near && <p className="text-steel-400">A good fix while you are there verifies the check-in by itself.</p>}
      </div>
    );
  }
  if (['denied', 'unsupported', 'failed'].includes(status)) {
    return (
      <div className="space-y-1.5 rounded-lg bg-warn-500/10 px-2.5 py-2 text-xs text-warn-400" role="status">
        <p>{message}</p>
        <input className="input" aria-label="Why there is no GPS" placeholder="Why — GPS off, basement, phone cannot find satellites" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={locate}>Try again</button>
          <button type="button" className="btn-primary px-2.5 py-1 text-xs" onClick={() => withoutGps(reason)} disabled={saving || reason.trim().length < 3}>Check in without GPS</button>
          <button type="button" className="text-xs text-steel-400 hover:underline" onClick={reset}>Cancel</button>
        </div>
        <p className="text-steel-400">Kept as not verified and Admin is told; a good fix while you are there verifies it.</p>
      </div>
    );
  }
  return null;
}

/** The Check in press, with what the phone is doing under it. */
export function CheckInButton({ visitId, onDone, className = '' }) {
  const recorder = useCheckIn(visitId, { onDone });
  return (
    <div className={`space-y-1 ${className}`}>
      <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={recorder.locate} disabled={recorder.busy} aria-label="Check in at this visit">
        {pressLabel(recorder, 'Check in')}
      </button>
      <CheckInPrecision recorder={recorder} />
    </div>
  );
}

/**
 * Plan a visit: for whom (the people this person may plan for), which day, a time if any. The
 * task gives the category, the purpose and the buyer.
 */
export function PlanVisitForm({ taskId, onPlanned, onCancel, compact = true }) {
  const { user } = useAuth();
  const { toast, warn } = useToast();
  const [people, setPeople] = useState(null);
  const [assignee, setAssignee] = useState('');
  const [date, setDate] = useState(isoDay());
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    field.me().then((mine) => {
      if (!live) return;
      setPeople(mine.people || []);
      const me = (mine.people || []).find((person) => String(person._id) === String(user?.id || user?._id));
      setAssignee(String((me || mine.people?.[0])?._id || ''));
    }).catch(() => { if (live) setPeople([]); });
    return () => { live = false; };
  }, [user]);
  const submit = async (event) => {
    event.preventDefault();
    if (!assignee) return;
    setSaving(true);
    try {
      const visit = await field.plan({ task: taskId, assignee, date, time: time || undefined, note: note.trim() || undefined });
      toast('Visit planned', `${visit.user?.name} · ${formatDate(visit.plannedDate)}${visit.plannedTime ? ` ${visit.plannedTime}` : ''}`);
      onPlanned?.(visit);
    } catch (failure) {
      warn('Visit not planned', failure?.response?.data?.message || failure.message);
    } finally {
      setSaving(false);
    }
  };
  if (people && !people.length) {
    return <p className="text-xs text-warn-400">You are not set to plan field visits — Admin marks who goes out and who plans for them on the Users page.</p>;
  }
  return (
    <form onSubmit={submit} className={`space-y-2 rounded-lg border border-line/[0.1] bg-line/[0.03] p-2.5 ${compact ? 'text-xs' : 'text-sm'}`} aria-label="Plan a field visit">
      <label className="block text-xs text-steel-300">
        Who visits
        <select className="input mt-0.5" aria-label="Who visits" value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={!people}>
          {(people || []).map((person) => <option key={person._id} value={person._id}>{person.self ? `${person.name} (me)` : person.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-steel-300">
          Day
          <input type="date" className="input mt-0.5" aria-label="Day of the visit" value={date} min={isoDay()} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label className="block text-xs text-steel-300">
          Time (optional)
          <input type="time" className="input mt-0.5" aria-label="Time of the visit" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
      </div>
      <input className="input" aria-label="Note for the visitor" placeholder="Note for the visitor (optional)" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={saving || !assignee}>{saving ? 'Planning…' : 'Plan the visit'}</button>
        {onCancel && <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={onCancel} disabled={saving}>Cancel</button>}
      </div>
    </form>
  );
}

/**
 * Needs visit, on a Sampling queue row or a PRT card [SamplingWorkQueue, PaymentsHome]: plan the
 * visit in two taps. Once planned, the row says so — and offers Check in to the person it is for;
 * checked in, it points to My field day, where the check-out asks what came of it.
 */
export default function NeedsVisitButton({ taskId, fieldVisit, className = '' }) {
  const { user } = useAuth();
  const [planning, setPlanning] = useState(false);
  const [current, setCurrent] = useState(fieldVisit || null);
  useEffect(() => { setCurrent(fieldVisit || null); }, [fieldVisit]);
  const me = String(user?.id || user?._id || '');
  const marks = user?.fieldVisit || {};
  if (!taskId) return null;
  if (current?.status === 'checked_in') {
    return (
      <p className={`text-xs text-aqua-300 ${className}`}>
        Checked in{current.user?.name ? ` · ${current.user.name}` : ''} · <Link to="/field" className="text-accent hover:underline">check out on My field day</Link>
      </p>
    );
  }
  if (current?.status === 'planned') {
    const mine = current.user && String(current.user._id || current.user) === me;
    return (
      <div className={`space-y-1 ${className}`}>
        <p className="text-xs text-steel-300">Visit planned · {current.user?.name || 'someone'} · {formatDate(current.date)}{current.time ? ` ${current.time}` : ''}</p>
        {mine && <CheckInButton visitId={current._id} onDone={(visit) => setCurrent({ _id: visit._id, status: visit.status, user: visit.user, date: visit.plannedDate, time: visit.plannedTime })} />}
      </div>
    );
  }
  if (!(marks.mayAssign || marks.maySelfPlan || user?.role === 'admin')) return null;
  if (planning) {
    return <PlanVisitForm taskId={taskId} onPlanned={(visit) => { setCurrent({ _id: visit._id, status: visit.status, user: visit.user, date: visit.plannedDate, time: visit.plannedTime }); setPlanning(false); }} onCancel={() => setPlanning(false)} />;
  }
  return (
    <button type="button" className={`btn-secondary px-3 py-1.5 text-xs ${className}`} onClick={() => setPlanning(true)} aria-label="Plan a field visit for this task">
      Needs visit
    </button>
  );
}
