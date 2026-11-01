import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { field } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { DayLine } from '../components/AttendanceCard.jsx';
import { visitStatusLabel } from '../components/FieldVisitButton.jsx';
import { Badge, DashboardSkeleton, EmptyState, ErrorState, Modal, PageHeader } from '../components/ui.jsx';
import { formatDate, isoDay } from '../utils/format.js';
import { mapsUrl } from '../utils/maps.js';

/**
 * Field today [server: fieldVisit.service `teamDay`]: the day's report, for Admin and for whoever
 * plans visits for others (their own people). One row a person — in the office, in the field or
 * only planned; visits completed, not completed and put off; hours on duty, at visits, travelling
 * and unrecorded; the flags the checks raised, in words. A row opens to its visits with their
 * times, outcomes and fixes; Admin corrects a visit's times there, with why, and the record keeps
 * what they were.
 */
const time = (value) => (value ? new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '—');
const hours = (minutes) => `${Math.floor((minutes || 0) / 60)}h ${String((minutes || 0) % 60).padStart(2, '0')}m`;
const minutesBetween = (from, to) => (from && to ? Math.max(0, Math.round((new Date(to) - new Date(from)) / 60_000)) : null);
const MODE = { field: ['Field', 'progress'], office: ['Office', 'neutral'], planned: ['Planned, not started', 'warn'], none: ['—', 'neutral'] };
const TONE = { planned: 'neutral', checked_in: 'progress', completed: 'success', not_completed: 'warn', rescheduled: 'neutral', cancelled: 'neutral' };
const local = (value) => (value ? new Date(new Date(value).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

function TimesForm({ visit, onDone, onCancel }) {
  const { toast, warn } = useToast();
  const [inAt, setInAt] = useState(local(visit.checkIn?.at));
  const [outAt, setOutAt] = useState(local(visit.checkOut?.at));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const done = await field.times({ id: visit._id, checkInAt: new Date(inAt).toISOString(), ...(outAt ? { checkOutAt: new Date(outAt).toISOString() } : {}), reason });
      toast('Times corrected', `${done.purpose} — the earlier times are kept in its history.`);
      onDone(done);
    } catch (failure) {
      warn('Not corrected', failure?.response?.data?.message || failure.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Correct the visit’s times">
      <p className="text-sm text-steel-300">{visit.purpose} · {visit.user?.name}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-steel-300">Checked in<input type="datetime-local" className="input mt-0.5" aria-label="Checked in at" value={inAt} onChange={(event) => setInAt(event.target.value)} required /></label>
        <label className="block text-xs text-steel-300">Checked out<input type="datetime-local" className="input mt-0.5" aria-label="Checked out at" value={outAt} onChange={(event) => setOutAt(event.target.value)} /></label>
      </div>
      <label className="block text-xs text-steel-300">Why<input className="input mt-0.5" aria-label="Why the times change" value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={500} /></label>
      <p className="text-xs text-steel-500">Corrected times are marked “edited by Admin” and read as not GPS verified; the history keeps what they were.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Correct the times'}</button>
      </div>
    </form>
  );
}

function VisitDetail({ visit, isAdmin, onEdit }) {
  return (
    <li className="rounded-lg border border-line/[0.08] p-2.5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-steel-100">{visit.purpose}{visit.customer?.name ? <span className="font-normal text-steel-400"> · {visit.customer.name}</span> : null}</p>
          <p className="text-steel-400">
            {visit.category.replace(/_/g, ' ')} · planned {formatDate(visit.plannedDate)}{visit.plannedTime ? ` ${visit.plannedTime}` : ''}{visit.assignedBy?.name ? ` by ${visit.assignedBy.name}` : ''}
            {visit.task?.title && visit.task.title !== visit.purpose ? ` · ${visit.task.title}` : ''}
            {visit.enquiry?.number ? <> · <Link to={`/enquiries/${visit.enquiry._id}`} className="text-accent hover:underline">{visit.enquiry.number}</Link></> : null}
          </p>
          {visit.checkIn?.at && (
            <p className="text-steel-300">
              In {time(visit.checkIn.at)} · out {time(visit.checkOut?.at)}{visit.checkOut?.at ? ` · ${minutesBetween(visit.checkIn.at, visit.checkOut.at)} min` : ''}
              {visit.checkIn.place?.name ? ` · ${visit.checkIn.place.name}` : ''}
              {visit.checkIn.accuracyM != null ? ` · ±${visit.checkIn.accuracyM} m` : ''}
              {visit.checkIn.lat != null && <> · <a href={mapsUrl(visit.checkIn)} target="_blank" rel="noreferrer" className="text-accent hover:underline">Map</a></>}
              {` · ${(visit.pings || []).length} fixes while there`}
              {visit.checkOut?.distanceFromCheckInM != null ? ` · out ${visit.checkOut.distanceFromCheckInM} m from the check-in` : ''}
              {visit.checkIn.verified ? ' · GPS verified' : ' · GPS not verified'}
              {visit.checkIn.enteredLater ? ` · entered later: ${visit.checkIn.reason}` : ''}
            </p>
          )}
          {visit.outcome?.label && (
            <p className="text-steel-200">
              {visit.outcome.label}{visit.outcome.amount ? ` · ₹${visit.outcome.amount}${visit.outcome.mode ? ` by ${visit.outcome.mode}` : ''}${visit.outcome.reference ? ` (${visit.outcome.reference})` : ''}` : ''}{visit.outcome.receivable?.number ? ` · ${visit.outcome.receivable.number} for Accounts` : ''}{visit.outcome.committedDate ? ` · promised ${formatDate(visit.outcome.committedDate)}` : ''}{visit.outcome.reason ? ` · ${visit.outcome.reason}` : ''}{visit.outcome.receivedBy ? ` · received by ${visit.outcome.receivedBy}` : ''}{visit.outcome.metWhom ? ` · met ${visit.outcome.metWhom}` : ''}{visit.outcome.summary ? ` · ${visit.outcome.summary}` : ''}
              {visit.outcome.report?.text ? <span className="block text-steel-400">{visit.outcome.report.text}</span> : null}
            </p>
          )}
          {visit.settled?.reason && <p className="text-steel-400">{visitStatusLabel(visit.status)}: {visit.settled.reason}{visit.settled.by?.name ? ` — ${visit.settled.by.name}` : ''}</p>}
          {visit.flags?.length > 0 && (
            <ul className="flex flex-wrap gap-1 pt-0.5">{visit.flags.map((entry) => <li key={entry.key}><Badge tone="warn">{entry.label}{entry.detail ? ` — ${entry.detail}` : ''}</Badge></li>)}</ul>
          )}
          {visit.history?.some((entry) => entry.action === 'times_edited') && (
            <p className="text-steel-500">{visit.history.filter((entry) => entry.action === 'times_edited').map((entry) => `Times edited by ${entry.by?.name || 'Admin'}: was ${time(entry.from?.checkInAt)}–${time(entry.from?.checkOutAt)} — ${entry.note}`).join('; ')}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={TONE[visit.status]}>{visitStatusLabel(visit.status)}</Badge>
          {isAdmin && visit.checkIn?.at && <button type="button" className="text-xs text-steel-400 hover:text-accent hover:underline" onClick={() => onEdit(visit)}>Correct times</button>}
        </div>
      </div>
    </li>
  );
}

function PersonRow({ row, open, onToggle, isAdmin, onEdit }) {
  const [label, tone] = MODE[row.mode] || MODE.none;
  const s = row.summary;
  return (
    <li className="card p-4">
      <button type="button" className="flex w-full flex-wrap items-start justify-between gap-3 text-left" onClick={onToggle} aria-expanded={open}>
        <div className="min-w-0">
          <p className="text-sm font-bold text-steel-50">{row.user.name} <Badge tone={tone}>{label}</Badge>{row.checkedIn ? <> <Badge tone="progress">Checked in · {row.checkedIn.purpose}</Badge></> : null}</p>
          <p className="mt-1 text-xs text-steel-300"><DayLine day={row.day} /></p>
          <p className="mt-1 text-xs tabular-nums text-steel-400">
            {s.planned} planned · {s.completed} completed · {s.notCompleted} not completed · {s.rescheduled} put off
            {row.mode === 'field' ? ` · on duty ${hours(s.dutyMinutes)} · at visits ${hours(s.visitMinutes)} · travel ${hours(s.travelMinutes)}${s.unrecordedMinutes ? ` · unrecorded ${hours(s.unrecordedMinutes)}` : ''}` : ''}
            {s.gpsNotVerified ? ` · ${s.gpsNotVerified} GPS not verified` : ''}
          </p>
          {row.flags.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">{row.flags.map((entry, index) => <li key={`${entry.key}-${index}`}><Badge tone="warn">{entry.label}{entry.purpose ? ` · ${entry.purpose}` : ''}</Badge></li>)}</ul>
          )}
        </div>
        <span className="text-xs text-steel-400">{open ? 'Hide visits' : `${row.visits.length} visit${row.visits.length === 1 ? '' : 's'} ▸`}</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {row.visits.length ? row.visits.map((visit) => <VisitDetail key={visit._id} visit={visit} isAdmin={isAdmin} onEdit={onEdit} />) : <li className="text-xs text-steel-500">No visits this day.</li>}
        </ul>
      )}
    </li>
  );
}

export default function FieldTeam() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || isoDay();
  const focus = params.get('user') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(focus);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => field.team({ date }).then((team) => { setData(team); setError(null); }).catch(setError), [date]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOpen(focus); }, [focus]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  const totals = data?.rows.reduce((sum, row) => ({ field: sum.field + (row.mode === 'field' ? 1 : 0), office: sum.office + (row.mode === 'office' ? 1 : 0), completed: sum.completed + row.summary.completed, flags: sum.flags + row.flags.length }), { field: 0, office: 0, completed: 0, flags: 0 });
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Field today"
        subtitle="Who is out, where they checked in, what came of each visit, and what the checks found."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="input py-1.5" aria-label="Day" value={date} max={isoDay()} onChange={(event) => setParams({ date: event.target.value }, { replace: true })} />
            <Link to="/field" className="btn-secondary py-1.5">My field day</Link>
          </div>
        )}
      />
      {!data ? <DashboardSkeleton label="Loading the day" tiles={3} /> : (
        <>
          <p className="text-sm text-steel-300">
            {formatDate(date)} · {totals.field} in the field · {totals.office} in the office · {totals.completed} visits completed{totals.flags ? ` · ${totals.flags} flag${totals.flags === 1 ? '' : 's'} to look at` : ' · nothing flagged'}
          </p>
          {data.rows.length ? (
            <ul className="space-y-3">
              {data.rows.map((row) => (
                <PersonRow key={row.user._id} row={row} isAdmin={isAdmin} open={String(open) === String(row.user._id)} onToggle={() => setOpen((current) => (String(current) === String(row.user._id) ? '' : row.user._id))} onEdit={setEditing} />
              ))}
            </ul>
          ) : (
            <EmptyState title="Nobody recorded a day" description={`No punch, field duty or visit on ${formatDate(date)} for the people you see.`} />
          )}
          <p className="text-xs text-steel-500">
            Travel is the time between one recorded event and the next, up to 90 minutes; a longer gap is unrecorded time. Fixes every five minutes need the app open on the phone, so a gap in fixes is said as a gap, not as leaving.
          </p>
        </>
      )}
      <Modal open={Boolean(editing)} title="Correct the visit’s times" onClose={() => setEditing(null)}>
        {editing && <TimesForm visit={editing} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
