import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { field } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import useCurrentLocation from '../hooks/useCurrentLocation.js';
import { Badge } from './ui.jsx';

/**
 * The day's attendance, from the phone [server: fieldVisit.service `dayAction`]: Punch In and
 * Punch Out for a day in the office; Field Duty Start and End with lunch for a day out. One
 * attendance a day — a field duty refuses the office punch; a punch followed by field duty is
 * kept and flagged for Admin. Each press carries the phone's fix when it gives one, and the
 * press never waits on the satellites: the fix is a few seconds' wait at most, then the press goes
 * with or without it.
 */
const time = (value) => (value ? new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '');
const hours = (minutes) => `${Math.floor((minutes || 0) / 60)}h ${String((minutes || 0) % 60).padStart(2, '0')}m`;

/** One press on the day: a fix is asked for first and sent with the action. */
export function useDayAction({ onDone } = {}) {
  const { toast, warn } = useToast();
  const location = useCurrentLocation();
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const { status, fix } = location;
  const send = useCallback(async (action, withFix) => {
    setBusy(true);
    try {
      const day = await field.act({ action, fix: withFix || null });
      toast(LABELS[action], withFix ? `${time(new Date())} · location kept` : `${time(new Date())} · no location from the phone`);
      onDone?.(day);
    } catch (failure) {
      warn('Not recorded', failure?.response?.data?.message || failure.message);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }, [onDone, toast, warn]);
  useEffect(() => {
    if (!pending) return;
    if (status === 'ready' && fix) send(pending, fix);
    else if (['denied', 'unsupported', 'failed'].includes(status)) send(pending, null);
  }, [status, fix, pending, send]);
  const press = (action) => {
    setPending(action);
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) location.locate();
    else send(action, null);
  };
  return { press, busy: busy || Boolean(pending), pending };
}

const LABELS = { punch_in: 'Punched in', punch_out: 'Punched out', duty_start: 'Field duty started', duty_end: 'Field duty ended', lunch_start: 'Lunch started', lunch_end: 'Lunch ended' };

/** The buttons the day offers now, from what it has: nothing pressed, in the office, out, at lunch, done. */
export function dayButtons(day, { allowed }) {
  const has = (key) => Boolean(day?.[key]?.at);
  if (has('dutyEnd')) return [];
  if (has('dutyStart')) {
    if (has('lunchStart') && !has('lunchEnd')) return [{ action: 'lunch_end', label: 'End lunch', primary: true }];
    return [{ action: 'duty_end', label: 'End field duty', primary: true }, ...(!has('lunchStart') ? [{ action: 'lunch_start', label: 'Start lunch' }] : [])];
  }
  if (has('punchOut')) return allowed ? [{ action: 'duty_start', label: 'Start field duty' }] : [];
  if (has('punchIn')) return [{ action: 'punch_out', label: 'Punch out', primary: true }, ...(allowed ? [{ action: 'duty_start', label: 'Start field duty' }] : [])];
  return [{ action: 'punch_in', label: 'Punch in', primary: !allowed }, ...(allowed ? [{ action: 'duty_start', label: 'Start field duty', primary: true }] : [])];
}

export function DayLine({ day }) {
  if (!day) return <span className="text-steel-500">Nothing recorded yet today.</span>;
  const parts = [];
  if (day.punchIn?.at) parts.push(`Punched in ${time(day.punchIn.at)}${day.punchOut?.at ? ` – out ${time(day.punchOut.at)}` : ''}`);
  if (day.dutyStart?.at) parts.push(`Field duty ${time(day.dutyStart.at)}${day.dutyStart.auto ? ' (from the first check-in)' : ''}${day.dutyEnd?.at ? ` – ${time(day.dutyEnd.at)}` : ' – running'}`);
  if (day.lunchStart?.at) parts.push(`Lunch ${time(day.lunchStart.at)}${day.lunchEnd?.at ? ` – ${time(day.lunchEnd.at)}` : ' – running'}`);
  return <span>{parts.join(' · ') || 'Nothing recorded yet today.'}</span>;
}

export default function AttendanceCard({ mine, onChanged, compact = false, link = true }) {
  const { user } = useAuth();
  const [state, setState] = useState(mine || null);
  const [error, setError] = useState(null);
  useEffect(() => { if (mine) setState(mine); }, [mine]);
  useEffect(() => {
    if (mine) return undefined;
    let live = true;
    field.me().then((data) => { if (live) setState(data); }).catch((failure) => { if (live) setError(failure.message); });
    return () => { live = false; };
  }, [mine]);
  const refresh = useCallback(async () => {
    try {
      const data = await field.me();
      setState(data);
      onChanged?.(data);
    } catch { /* the press was recorded; the card refreshes on the next load */ }
  }, [onChanged]);
  const { press, busy, pending } = useDayAction({ onDone: refresh });
  const allowed = Boolean(user?.fieldVisit?.allowed || user?.role === 'admin');
  if (error) return null;
  const day = state?.day;
  const buttons = dayButtons(day, { allowed });
  const summary = day?.summary;
  return (
    <section className={`card ${compact ? 'p-3' : 'p-4'}`} aria-label="Attendance today">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-steel-500">Attendance today</p>
          <p className="mt-1 text-sm text-steel-200"><DayLine day={day} /></p>
          {day?.flags?.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">{day.flags.map((entry) => <Badge key={entry.key} tone="warn">{entry.label}</Badge>)}</p>
          )}
          {day?.dutyEnd?.at && summary && (
            <p className="mt-1 text-xs text-steel-400">
              {summary.completed} completed · {summary.notCompleted} not completed · {summary.rescheduled} put off · on duty {hours(summary.dutyMinutes)} · at visits {hours(summary.visitMinutes)} · travel {hours(summary.travelMinutes)}{summary.unrecordedMinutes ? ` · unrecorded ${hours(summary.unrecordedMinutes)}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {buttons.map((button) => (
            <button key={button.action} type="button" className={`${button.primary ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`} onClick={() => press(button.action)} disabled={busy}>
              {pending === button.action ? 'Locating…' : button.label}
            </button>
          ))}
          {allowed && link && <Link to="/field" className="text-xs font-semibold text-accent hover:underline">My field day →</Link>}
        </div>
      </div>
      {state?.checkedIn && (
        <p className="mt-2 text-xs text-aqua-300">Checked in at “{state.checkedIn.purpose}” since {time(state.checkedIn.checkIn?.at)} · <Link to="/field" className="text-accent hover:underline">check out on My field day</Link></p>
      )}
    </section>
  );
}
