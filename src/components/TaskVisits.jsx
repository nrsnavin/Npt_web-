import { useEffect, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import useCurrentLocation from '../hooks/useCurrentLocation.js';
import AuthedImage from './AuthedImage.jsx';
import { Notice } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { accuracyLabel, mapsUrl } from '../utils/maps.js';
import { departmentLabel } from '../utils/pipeline.js';

/**
 * A visit to the buyer's place, recorded from the phone on the spot [server: taskVisit.service]:
 * Sampling at the buyer's for a sample, Payment Collection or the Payment Recovery Team calling
 * for the money. One button — Record location — takes the phone's fix, and the server keeps it on
 * the task with a satellite picture of the spot. Every visit is listed with its date, time, the
 * nearest town, how sure the fix was, a map link and the picture — on the task, and on the
 * enquiry for Admin and its marketing person [components/EnquiryRecords.jsx].
 */
export const VISIT_KINDS = ['sample_request', 'team_payment_followup', 'my_payment_followup', 'prt_recovery'];

const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const coords = (visit) => `${Number(visit.lat).toFixed(5)}, ${Number(visit.lng).toFixed(5)}`;
export const visitPlace = (visit) => (visit.place?.name
  ? `${visit.place.distanceKm != null && visit.place.distanceKm >= 3 ? `${Math.round(visit.place.distanceKm)} km from ` : ''}${visit.place.name}${visit.place.state ? `, ${visit.place.state}` : ''}`
  : coords(visit));

/** The button: one press, the phone's fix, the visit recorded. */
export function RecordVisitButton({ todo, onRecorded, className = '' }) {
  const { toast, warn } = useToast();
  const location = useCurrentLocation();
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  /* The fix came: it goes to the task at once — the person is standing there. */
  useEffect(() => {
    if (!saving && asking && location.status === 'ready' && location.fix) {
      setSaving(true);
      workspace.todos.visit({ id: todo._id, ...location.fix, ...(note.trim() ? { note: note.trim() } : {}) })
        .then((answer) => {
          toast('Visit recorded', `${when(answer.visit?.capturedAt)} · ${visitPlace(answer.visit || location.fix)}${answer.visit?.imageProblem ? ` — ${answer.visit.imageProblem}` : ' — satellite picture kept'}`);
          setNote('');
          setAsking(false);
          onRecorded?.(answer.data, answer.visit);
        })
        .catch((failure) => warn('Visit not recorded', failure?.response?.data?.message || failure.message))
        .finally(() => setSaving(false));
    }
  }, [asking, location.status, location.fix, saving, note, todo._id, onRecorded, toast, warn]);

  const press = () => { setAsking(true); location.locate(); };
  const busy = saving || (asking && location.status === 'locating');
  return (
    <div className={`space-y-2 rounded-xl border border-aqua-500/25 bg-aqua-500/[0.05] p-3 ${className}`} aria-label="Record a visit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-steel-50">At the buyer’s place?</p>
          <p className="text-xs text-steel-400">Record your location here — the time, the place and a satellite picture of the spot go on this task, for Admin and the marketing person to see.</p>
        </div>
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={press}>
          {saving ? 'Recording…' : busy ? 'Finding your location…' : 'Record location'}
        </button>
      </div>
      <input className="input" placeholder="A word about the visit (optional) — who you met, what was agreed" aria-label="Note with the visit" value={note} onChange={(event) => setNote(event.target.value)} />
      {asking && ['denied', 'unsupported', 'failed'].includes(location.status) && <Notice tone="warn">{location.message}</Notice>}
    </div>
  );
}

/** Every visit on a task — or, on the enquiry, across its tasks (`showTask`). */
export function VisitList({ visits = [], showTask = false, className = '' }) {
  if (!visits.length) return null;
  return (
    <ul className={`space-y-3 ${className}`} aria-label="Visits">
      {visits.map((visit) => (
        <li key={visit._id} className="rounded-xl border border-line/[0.08] bg-line/[0.02] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="font-semibold text-steel-50">
              Visited {when(visit.capturedAt || visit.at)}
              <span className="font-normal text-steel-300"> · {visitPlace(visit)}</span>
              {visit.accuracyM != null && <span className="font-normal text-steel-500"> · {accuracyLabel(visit.accuracyM)}</span>}
            </p>
            <span className="text-xs text-steel-400">
              {visit.by?.name || 'someone'}{showTask && visit.task ? ` · ${departmentLabel(visit.task.department)}${visit.task.title ? ` — ${visit.task.title}` : ''}` : ''}
            </span>
          </div>
          {visit.note && <p className="mt-1 text-sm text-steel-200">“{visit.note}”</p>}
          <p className="mt-1 text-xs text-steel-400">
            {coords(visit)} · <a href={mapsUrl(visit)} target="_blank" rel="noreferrer" className="text-accent hover:underline">Open in Maps</a>
            {visit.imageProblem ? ` · ${visit.imageProblem}` : ''}
          </p>
          {visit.image?.key && (
            <AuthedImage attachmentKey={visit.image.key} alt={`Satellite view of the visit near ${visitPlace(visit)}`} className="mt-2 max-h-64 w-full rounded-lg object-cover" />
          )}
        </li>
      ))}
    </ul>
  );
}

/** The task's visits block: the button for whoever works it while open, and the visits so far. */
export default function TaskVisits({ todo, mayWork }) {
  /* The visits as the task came, then as the server answers each recording — the panel's task may be the list's older copy. */
  const [visits, setVisits] = useState(todo?.visits || []);
  useEffect(() => { setVisits(todo?.visits || []); }, [todo?.visits]);
  if (!VISIT_KINDS.includes(todo?.kind)) return null;
  /* The panel stays open with the visit on it — a visit moves nothing, so the board is not told to redraw (which would close it). */
  const recorded = (task, visit) => setVisits(task?.visits?.length ? task.visits : [...visits, visit].filter(Boolean));
  return (
    <div className="space-y-3">
      {mayWork && !todo.completed && <RecordVisitButton todo={todo} onRecorded={recorded} />}
      <VisitList visits={visits} />
    </div>
  );
}
