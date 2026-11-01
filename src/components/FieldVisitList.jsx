import { Link } from 'react-router-dom';
import { Badge } from './ui.jsx';
import { visitStatusLabel } from './FieldVisitButton.jsx';
import { formatDate } from '../utils/format.js';
import { mapsUrl } from '../utils/maps.js';

/**
 * The field visits on an enquiry, a job or a task [server: fieldVisit.service]: who goes, which
 * day, when they were there, what came of it, and what the checks found — the plan and the
 * outcome, beside the check-in the task itself keeps as a visit [TaskVisits `VisitList`].
 */
const time = (value) => (value ? new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '');
const TONE = { planned: 'neutral', checked_in: 'progress', completed: 'success', not_completed: 'warn', rescheduled: 'neutral', cancelled: 'neutral' };

export const outcomeLine = (outcome) => [
  outcome?.label,
  outcome?.amount ? `₹${outcome.amount}${outcome.mode ? ` by ${outcome.mode}` : ''}${outcome.reference ? ` (${outcome.reference})` : ''}` : null,
  outcome?.receivable?.number ? `${outcome.receivable.number} for Accounts` : null,
  outcome?.committedDate ? `promised ${formatDate(outcome.committedDate)}` : null,
  outcome?.reason, outcome?.receivedBy ? `received by ${outcome.receivedBy}${outcome.pieces ? `, ${outcome.pieces} pcs` : ''}` : null,
  outcome?.metWhom ? `met ${outcome.metWhom}` : null, outcome?.summary,
  outcome?.nextFollowUp ? `next follow-up ${formatDate(outcome.nextFollowUp)}` : null,
].filter(Boolean).join(' · ');

export default function FieldVisitList({ visits, showTask = false, className = '' }) {
  if (!visits?.length) return null;
  return (
    <ul className={`space-y-2 ${className}`}>
      {visits.map((visit) => (
        <li key={visit._id} className="rounded-lg border border-line/[0.08] p-2.5 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-steel-100">
                {visit.user?.name || 'Someone'} · {formatDate(visit.plannedDate)}{visit.plannedTime ? ` ${visit.plannedTime}` : ''}
                <span className="font-normal text-steel-400"> · {visit.category.replace(/_/g, ' ')}{showTask && visit.task?.title ? ` · ${visit.task.title}` : ''}</span>
              </p>
              {visit.assignedBy?.name && <p className="text-steel-400">Planned by {visit.assignedBy.name}{visit.reschedules ? ` · put off ${visit.reschedules}×` : ''}</p>}
              {visit.checkIn?.at && (
                <p className="text-steel-300">
                  In {time(visit.checkIn.at)}{visit.checkOut?.at ? ` · out ${time(visit.checkOut.at)}` : ''}{visit.checkIn.place?.name ? ` · ${visit.checkIn.place.name}` : ''}
                  {visit.checkIn.lat != null && <> · <a href={mapsUrl(visit.checkIn)} target="_blank" rel="noreferrer" className="text-accent hover:underline">Map</a></>}
                  {visit.checkIn.verified ? ' · GPS verified' : ' · GPS not verified'}
                </p>
              )}
              {visit.outcome?.label && (
                <p className="text-steel-200">
                  {outcomeLine(visit.outcome)}
                  {visit.outcome.report?.text ? <span className="block text-steel-400">{visit.outcome.report.text}</span> : null}
                </p>
              )}
              {visit.settled?.reason && <p className="text-steel-400">{visitStatusLabel(visit.status)}: {visit.settled.reason}</p>}
              {visit.flags?.length > 0 && <p className="flex flex-wrap gap-1 pt-0.5">{visit.flags.map((entry) => <Badge key={entry.key} tone="warn">{entry.label}</Badge>)}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge tone={TONE[visit.status]}>{visitStatusLabel(visit.status)}</Badge>
              <Link to={`/field/team?date=${visit.plannedDate}&user=${visit.user?._id || visit.user}`} className="text-steel-400 hover:text-accent hover:underline">Field today</Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
