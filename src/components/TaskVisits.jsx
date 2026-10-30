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

/**
 * A visit's note in the visitor's own few words [server: taskVisit.service `noteVisit`]: who they
 * met, what happened, what the buyer said. Rough is fine — any language, no full stops — the server
 * writes it up for Admin and the marketing person [visitNote.llm.js] and keeps these words beside it.
 */
const NOTE_FIELDS = [
  { key: 'met', label: 'Who did you meet?', placeholder: 'Manager Suresh / accounts madam' },
  { key: 'happened', label: 'What happened?', placeholder: 'Gave 3 sample pcs / cheque not ready' },
  { key: 'response', label: 'What did they say?', placeholder: 'Will confirm PO next week / pay tmrw 11 am' },
];
const hasWords = (words) => NOTE_FIELDS.some((field) => String(words?.[field.key] || '').trim());

export function VisitNoteForm({ taskId, visit, onSaved, onCancel, compact = false }) {
  const { toast, warn } = useToast();
  const [words, setWords] = useState({ met: visit?.met || '', happened: visit?.happened || '', response: visit?.response || '' });
  const [saving, setSaving] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    if (!hasWords(words)) return;
    setSaving(true);
    try {
      const answer = await workspace.todos.visitNote({ id: taskId, visitId: visit._id, ...words });
      toast('Visit note saved', answer.visit?.report?.text || 'Admin and the marketing person are told.');
      onSaved?.(answer.data, answer.visit);
    } catch (failure) {
      warn('Note not saved', failure?.response?.data?.message || failure.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={save} className={`space-y-2 rounded-lg border border-line/[0.1] bg-line/[0.03] p-2.5 ${compact ? 'w-full' : ''}`} aria-label="Visit note">
      <p className="text-xs text-steel-400">A few words is enough — in any language. Admin and the marketing person get it written up clearly.</p>
      {NOTE_FIELDS.map((field) => (
        <label key={field.key} className="block text-xs text-steel-300">
          {field.label}
          <input
            className="input mt-0.5"
            aria-label={field.label}
            placeholder={field.placeholder}
            maxLength={field.key === 'met' ? 500 : 1000}
            value={words[field.key]}
            onChange={(event) => setWords((current) => ({ ...current, [field.key]: event.target.value }))}
          />
        </label>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={saving || !hasWords(words)}>{saving ? 'Writing it up…' : 'Save note'}</button>
        {onCancel && <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={saving} onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

/** The visit's report as Admin and marketing read it, with the visitor's own words one tap away. */
function VisitReport({ visit }) {
  const [words, setWords] = useState(false);
  if (!visit.report?.text) return null;
  const tone = { positive: 'border-success-500/30 bg-success-500/[0.05]', negative: 'border-danger-500/30 bg-danger-500/[0.05]' }[visit.report.outcome] || 'border-line/[0.1] bg-line/[0.03]';
  return (
    <div className={`mt-2 rounded-lg border p-2.5 ${tone}`} aria-label="Visit report">
      <p className="text-xs font-semibold text-steel-300">Visit report{visit.report.writtenBy === 'model' ? ' · written up from the visitor’s note' : ''}</p>
      <p className="mt-0.5 text-sm text-steel-100">{visit.report.text}</p>
      <button type="button" className="mt-1 text-xs text-accent hover:underline" onClick={() => setWords((shown) => !shown)}>
        {words ? 'Hide their words' : 'Their own words'}
      </button>
      {words && (
        <dl className="mt-1 grid gap-0.5 text-xs text-steel-300">
          {NOTE_FIELDS.filter((field) => visit[field.key]).map((field) => (
            <div key={field.key}><dt className="inline text-steel-500">{field.label} </dt><dd className="inline">“{visit[field.key]}”</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** The task's block: the button, a word about the visit, and what the phone is doing. */
export function RecordVisitButton({ todo, onRecorded, className = '' }) {
  const { warn } = useToast();
  const [words, setWords] = useState({ met: '', happened: '', response: '' });
  /* Recorded, then — if a word was given — the note on the new visit, written up for Admin and marketing. */
  const recorded = useCallback(async (task, visit) => {
    let latest = task;
    if (visit?._id && hasWords(words)) {
      try {
        latest = (await workspace.todos.visitNote({ id: todo._id, visitId: visit._id, ...words })).data || task;
      } catch (failure) {
        warn('Visit recorded, note not saved', failure?.response?.data?.message || failure.message);
      }
    }
    setWords({ met: '', happened: '', response: '' });
    onRecorded?.(latest, visit);
  }, [onRecorded, todo._id, words, warn]);
  const recorder = useVisitRecorder(todo._id, { onRecorded: recorded });
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
      <div className="grid gap-2 sm:grid-cols-3">
        {NOTE_FIELDS.map((field) => (
          <label key={field.key} className="block text-xs text-steel-300">
            {field.label} <span className="text-steel-500">(optional)</span>
            <input className="input mt-0.5" aria-label={field.label} placeholder={field.placeholder} value={words[field.key]} onChange={(event) => setWords((current) => ({ ...current, [field.key]: event.target.value }))} />
          </label>
        ))}
      </div>
      <p className="text-xs text-steel-500">A few words is enough, in any language — Admin and the marketing person get it written up clearly. You can add it after too.</p>
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
  /* The visit just recorded here: its note is asked for on the spot, in a few words. */
  const [justVisited, setJustVisited] = useState(null);
  const [noting, setNoting] = useState(false);
  const recorded = useCallback((task, visit) => { setShown(summaryOf(task)); setJustVisited(visit || null); onRecorded?.(task); }, [onRecorded]);
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
      {justVisited?._id && !noting && !justVisited.report?.text && (
        <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={() => setNoting(true)}>+ Add what happened</button>
      )}
      {justVisited?._id && justVisited.report?.text && <span className="text-xs text-steel-400">Note saved — Admin and marketing are told.</span>}
      {noting && justVisited?._id && (
        <VisitNoteForm
          compact
          taskId={taskId}
          visit={justVisited}
          onCancel={() => setNoting(false)}
          onSaved={(task, visit) => { setNoting(false); setJustVisited(visit); onRecorded?.(task); }}
        />
      )}
    </div>
  );
}

/** Every visit on a task — or, on the enquiry, across its tasks (`showTask`). */
export function VisitList({ visits = [], showTask = false, className = '', mayNote = false, taskId = null, onNoted }) {
  const [noting, setNoting] = useState(null);
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
          <VisitReport visit={visit} />
          {/* Whoever works the task adds the note, or corrects it — written up again for Admin and marketing. */}
          {mayNote && taskId && noting !== String(visit._id) && (
            <button type="button" className="mt-1 text-xs font-semibold text-accent hover:underline" onClick={() => setNoting(String(visit._id))}>
              {visit.report?.text ? 'Edit note' : '+ Add what happened'}
            </button>
          )}
          {mayNote && taskId && noting === String(visit._id) && (
            <div className="mt-2">
              <VisitNoteForm taskId={taskId} visit={visit} onCancel={() => setNoting(null)} onSaved={(task, saved) => { setNoting(null); onNoted?.(task, saved); }} />
            </div>
          )}
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
      <VisitList visits={visits} mayNote={mayWork} taskId={todo._id} onNoted={(task) => task?.visits && setVisits(task.visits)} />
    </div>
  );
}
