import { useCallback, useEffect, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import usePreciseLocation, { TARGET_ACCURACY_M } from '../hooks/usePreciseLocation.js';
import AuthedImage from './AuthedImage.jsx';
import { Notice } from './ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { accuracyLabel, mapsUrl } from '../utils/maps.js';
import { departmentLabel } from '../utils/pipeline.js';

/**
 * A visit to the buyer's place, recorded from the phone on the spot [server: taskVisit.service]:
 * Sampling at the buyer's for a sample, Payment Collection or the Payment Recovery Team calling
 * for the money. One button — Record location — waits for a precise fix (under 10 m when the
 * phone can give one [hooks/usePreciseLocation.js]) and the server keeps it on the task with a
 * satellite picture of the spot. Every visit is listed with its date, time, the nearest town, how
 * sure the fix was, a map link and the picture — on the task, and on the enquiry for Admin and its
 * marketing person [components/EnquiryRecords.jsx].
 */
export const VISIT_KINDS = ['sample_request', 'team_payment_followup', 'my_payment_followup', 'prt_recovery', 'request_prt_visit'];

const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const coords = (visit) => `${Number(visit.lat).toFixed(5)}, ${Number(visit.lng).toFixed(5)}`;
export const visitPlace = (visit) => (visit.place?.name
  ? `${visit.place.distanceKm != null && visit.place.distanceKm >= 3 ? `${Math.round(visit.place.distanceKm)} km from ` : ''}${visit.place.name}${visit.place.state ? `, ${visit.place.state}` : ''}`
  : coords(visit));
/** Within 10 m: the gate, not the street. */
export const isPrecise = (visit) => visit?.accuracyM != null && visit.accuracyM <= TARGET_ACCURACY_M;

/**
 * The press, the precise fix, the visit sent — shared by the task's block and the one-press button
 * on the queues and cards. The fix goes to the task the moment it is within 10 m; when the window
 * runs out short of it, the person chooses: record it as it is, or try again in the open.
 */
function useVisitRecorder(taskId, { note, onRecorded } = {}) {
  const { toast, warn } = useToast();
  const location = usePreciseLocation();
  const [saving, setSaving] = useState(false);
  const { status, fix, reset } = location;

  useEffect(() => {
    if (status !== 'ready' || !fix || saving) return;
    setSaving(true);
    workspace.todos.visit({ id: taskId, ...fix, ...(note?.trim() ? { note: note.trim() } : {}) })
      .then((answer) => {
        const visit = answer.visit || fix;
        toast('Visit recorded', `${when(visit.capturedAt)} · ${visitPlace(visit)} · ${accuracyLabel(visit.accuracyM)}${answer.visit?.imageProblem ? ` — ${answer.visit.imageProblem}` : ' — satellite picture kept'}`);
        onRecorded?.(answer.data, answer.visit);
      })
      .catch((failure) => warn('Visit not recorded', failure?.response?.data?.message || failure.message))
      .finally(() => { setSaving(false); reset(); });
  }, [status, fix, saving, taskId, note, onRecorded, toast, warn, reset]);

  return { ...location, saving, busy: saving || status === 'locating' };
}

/** What the phone is doing while it looks, and the choice when it could not get close enough. */
function Precision({ recorder, compact = false }) {
  const { status, best, fix, message, targetM, locate, accept, reset } = recorder;
  if (status === 'locating') {
    return (
      <p className="text-xs text-aqua-300" aria-live="polite">
        {best ? `${accuracyLabel(best.accuracyM)} so far — waiting for under ${targetM} m…` : 'Waiting for the satellites…'}
        {!compact && ' Stand in the open, away from walls and roofs.'}
      </p>
    );
  }
  if (status === 'rough') {
    return (
      <div className="space-y-1.5 rounded-lg bg-warn-500/10 px-2.5 py-2 text-xs text-warn-400" role="status">
        <p>{message}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={locate}>Try again</button>
          <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={accept}>Record anyway ({accuracyLabel(fix.accuracyM)})</button>
          <button type="button" className="text-xs text-steel-400 hover:underline" onClick={reset}>Cancel</button>
        </div>
      </div>
    );
  }
  if (['denied', 'unsupported', 'failed'].includes(status)) {
    return compact ? <p className="text-xs text-warn-400" role="status">{message}</p> : <Notice tone="warn">{message}</Notice>;
  }
  return null;
}

const pressLabel = (recorder, idle) => (recorder.saving ? 'Recording…'
  : recorder.status === 'locating' ? (recorder.best ? `Locating… ${accuracyLabel(recorder.best.accuracyM)}` : 'Locating…')
    : idle);

/** The task's block: the button, a word about the visit, and what the phone is doing. */
export function RecordVisitButton({ todo, onRecorded, className = '' }) {
  const [note, setNote] = useState('');
  const recorded = useCallback((task, visit) => { setNote(''); onRecorded?.(task, visit); }, [onRecorded]);
  const recorder = useVisitRecorder(todo._id, { note, onRecorded: recorded });
  return (
    <div className={`space-y-2 rounded-xl border border-aqua-500/25 bg-aqua-500/[0.05] p-3 ${className}`} aria-label="Record a visit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-steel-50">At the buyer’s place?</p>
          <p className="text-xs text-steel-400">Record your location here — the time, the place to within {TARGET_ACCURACY_M} m and a satellite picture of the spot go on this task, for Admin and the marketing person to see.</p>
        </div>
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={recorder.busy || recorder.status === 'rough'} onClick={recorder.locate}>
          {pressLabel(recorder, 'Record location')}
        </button>
      </div>
      <input className="input" placeholder="A word about the visit (optional) — who you met, what was agreed" aria-label="Note with the visit" value={note} onChange={(event) => setNote(event.target.value)} />
      <Precision recorder={recorder} />
    </div>
  );
}

/** "Visited 30 Oct, 05:23 pm · Tiruppur · 2 visits" — a task's visits, short, from its summary or its own list. */
export function visitLine(summary) {
  if (!summary?.count) return 'No visit recorded yet';
  const at = summary.last?.at ? new Date(summary.last.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return [`Visited ${at}`.trim(), summary.last?.place, summary.last?.accuracyM != null && accuracyLabel(summary.last.accuracyM), summary.count > 1 && `${summary.count} visits`].filter(Boolean).join(' · ');
}
export const summaryOf = (task) => {
  const visits = task?.visits || [];
  const last = visits.at(-1);
  return { task: task?._id, count: visits.length, last: last ? { at: last.capturedAt || last.at, place: last.place?.name || null, accuracyM: last.accuracyM ?? null } : null };
};

/**
 * Record location in one press, on a queue row or a card [SamplingWorkQueue, DeskTables PRT,
 * PaymentsHome, the desk's cards]: the precise fix goes to the task at once, and the line under
 * the button says the last visit. No form — the person is standing at the buyer's gate.
 */
export function QuickVisitButton({ taskId, summary, onRecorded, className = '' }) {
  const [shown, setShown] = useState(summary || null);
  useEffect(() => { setShown(summary || null); }, [summary]);
  const recorded = useCallback((task) => { setShown(summaryOf(task)); onRecorded?.(task); }, [onRecorded]);
  const recorder = useVisitRecorder(taskId, { onRecorded: recorded });
  if (!taskId) return null;
  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-aqua-500/15 px-3 py-1.5 text-xs font-semibold text-aqua-300 ring-1 ring-inset ring-aqua-500/30 hover:bg-aqua-500/25 disabled:opacity-60"
        aria-label="Record location of this visit"
        disabled={recorder.busy || recorder.status === 'rough'}
        onClick={recorder.locate}
      >
        <span aria-hidden="true">📍</span>
        {pressLabel(recorder, 'Record location')}
      </button>
      <Precision recorder={recorder} compact />
      <span className={`text-xs ${shown?.count ? 'text-success-400' : 'text-steel-500'}`}>{visitLine(shown)}</span>
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
              {visit.accuracyM != null && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${isPrecise(visit) ? 'bg-success-500/15 text-success-400' : 'bg-warn-500/15 text-warn-400'}`}>
                  {isPrecise(visit) ? 'Precise' : 'Approximate'}
                </span>
              )}
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
          {/*
            The satellite picture: 50 × 35 m round the fix, at the finest the imagery has there (about
            0.3 m a pixel) [server: taskVisit.service `satelliteImage`] — shown whole and scaled up, never
            cropped, with the spot the phone gave marked at its centre.
          */}
          {visit.image?.key && (
            <figure className="mt-2 w-full max-w-md">
              <div className="relative overflow-hidden rounded-lg">
                <AuthedImage attachmentKey={visit.image.key} alt={`Satellite view of the visit near ${visitPlace(visit)}`} className="block aspect-[10/7] w-full object-cover" />
                <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-danger-500 shadow" />
              </div>
              <figcaption className="mt-1 text-xs text-steel-500">
                Satellite view{visit.imageSpan?.widthM ? ` · ${visit.imageSpan.widthM} m × ${visit.imageSpan.heightM} m` : ''}{visit.imageSpan?.metresPerPixel ? ` · ${visit.imageSpan.metresPerPixel} m per pixel` : ''} · the dot is where the phone was
              </figcaption>
            </figure>
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
