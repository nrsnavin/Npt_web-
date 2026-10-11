import { useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { Field, Modal, Notice } from './ui.jsx';
import TaskPdfLink from './TaskPdfLink.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { todayInIndia } from '../utils/taskForm.js';

/**
 * A department's own workflow on its task [server: config/departmentTaskForms.js `statuses`]:
 * the Status update list, and the actions beside it — correcting the contact details, and
 * uploading the work as a PDF.
 *
 * For the SO team: SO Waiting → SO Preparing → Needs Clarification (a comment; the enquiry's
 * marketing person gets a task to answer, and the answer comes back here) → SO Prepared, which
 * is reached by uploading the sales order and moves the enquiry on to Production.
 *
 * For Production: EDD Request Received → … → Task Closed, every move with a remark and, where
 * it says when, the ERD / ready date — which becomes the enquiry's EDD. The enquiry's marketing
 * person and Admin see each move under "Needs your action".
 */

const tomorrowInIndia = () => todayInIndia(new Date(Date.now() + 24 * 60 * 60 * 1000));

/**
 * The move itself, beside the list: the ready date and the remark, then Update status
 * [server: handoff.service `setTaskStatus`].
 */
function MoveForm({ todo, form, step, onCancel, onMoved }) {
  const [date, setDate] = useState(step.date === 'tomorrow' ? tomorrowInIndia() : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const dateNeeded = step.date === 'required' && !date;
  const remarkNeeded = form.remarkRequired && note.trim().length < 3;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onMoved(await workspace.todos.status({ id: todo._id, status: step.key, note, ...(date ? { date } : {}) }));
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} aria-label={`Move to ${step.label}`} className="space-y-2 rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
      <p className="text-xs font-semibold text-steel-200">
        Move to {step.label}
        {form.notifyStatus && <span className="font-normal text-steel-400"> · the enquiry’s marketing person and Admin are told</span>}
      </p>
      <div className="grid gap-2">
        {form.statusDate && (
          <Field label={form.statusDate.label} required={step.date === 'required'}>
            <input type="date" className="input" min={todayInIndia()} value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        )}
        <Field label={form.remark?.label || 'Remarks'} required={form.remarkRequired}>
          <textarea rows={2} className="input" placeholder={form.remark?.placeholder || ''} value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
        </Field>
      </div>
      {dateNeeded && <p className="text-xs text-warn-400">Give the {form.statusDate?.label || 'ready date'} for {step.label}</p>}
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || dateNeeded || remarkNeeded}>{busy ? 'Saving…' : 'Update status'}</button>
      </div>
    </form>
  );
}

const PDF_LIMIT = 1024 * 1024;

function CommentDialog({ step, onClose, onSave }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await onSave(note);
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={step.label} description={step.raises ? 'The enquiry’s marketing person gets a task to answer this; their answer comes back onto this task.' : undefined} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="What needs clarifying" required>
          <textarea rows={3} className="input" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || note.trim().length < 3}>{busy ? 'Saving…' : 'Ask marketing'}</button>
        </div>
      </form>
    </Modal>
  );
}

function UploadDialog({ title, step, todo, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const tooBig = file && file.size > PDF_LIMIT;
  const notPdf = file && file.type !== 'application/pdf';
  const upload = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const answer = await workspace.todos.result({ id: todo._id, file, note });
      onDone(answer);
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={title} description={`Marks the task ${step.label} and finishes it${step.next ? ' — the enquiry moves on to Production' : ''}.`} onClose={onClose}>
      <form onSubmit={upload} className="space-y-4">
        <Field label="Sales order PDF" required hint="PDF, 1 MB at most" error={tooBig ? 'That PDF is over 1 MB' : notPdf ? 'Attach a PDF' : undefined}>
          <input type="file" accept="application/pdf" required className="input" onChange={(event) => setFile(event.target.files?.[0] || null)} autoFocus />
        </Field>
        <Field label="Note" hint="Optional — the SO number, anything Production should know">
          <input className="input" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !file || tooBig || notPdf}>{busy ? 'Uploading…' : 'Upload and finish'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ContactDialog({ fields, todo, onClose, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.key, todo.brief?.[field.key] || ''])));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await workspace.todos.brief({ id: todo._id, brief: values }));
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Edit contact details" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {fields.map((field) => (
          <Field key={field.key} label={field.label}>
            <input className="input" value={values[field.key]} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
          </Field>
        ))}
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** The status list and the workflow's actions, for a task whose department has a workflow. */
export default function TaskWorkflow({ todo, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, todo?.kind);
  const statuses = button?.form?.statuses || [];
  const [asking, setAsking] = useState(null);
  const [moving, setMoving] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState(null);
  /* Said as a toast: the finished task leaves the list it was on. */
  const { toast, warn } = useToast();
  if (!statuses.length) return null;

  const current = statuses.find((entry) => entry.key === todo.status);
  const resultStep = statuses.find((entry) => entry.pdf);
  const editable = (button.asks || []).filter((field) => field.editable);

  if (todo.completed) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-success-500/15 px-2.5 py-1 font-semibold text-success-400">{current?.label || 'Done'}</span>
        <TaskPdfLink file={todo.resultFile} />
      </div>
    );
  }

  const choose = async (key) => {
    const step = statuses.find((entry) => entry.key === key);
    setProblem(null);
    if (step.pdf) return setUploading(true);
    if (step.comment) return setAsking(step);
    /* A workflow whose every move says why, or says when: the remark and date first. */
    if (button.form.remarkRequired || button.form.statusDate) return setMoving(key === todo.status ? null : step);
    try {
      onChanged?.(await workspace.todos.status({ id: todo._id, status: key }));
    } catch (failure) {
      setProblem(failure.message);
    }
    return null;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-steel-400" htmlFor={`status-${todo._id}`}>Status update</label>
        <select id={`status-${todo._id}`} className="input w-auto min-w-[12rem] py-1.5 text-sm" value={moving?.key || todo.status || ''} onChange={(event) => choose(event.target.value)}>
          {statuses.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {editable.length > 0 && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing(true)}>Edit contact details</button>
        )}
        {resultStep && (
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setUploading(true)}>
            {button.form.resultLabel || `Upload PDF — ${resultStep.label}`}
          </button>
        )}
      </div>
      {problem && <Notice tone="danger">{problem}</Notice>}
      {moving && (
        <MoveForm
          key={moving.key}
          todo={todo}
          form={button.form}
          step={moving}
          onCancel={() => setMoving(null)}
          onMoved={(saved) => {
            setMoving(null);
            if (saved?.completed) toast(moving.label, 'The task is finished.');
            onChanged?.(saved);
          }}
        />
      )}

      {asking && (
        <CommentDialog
          step={asking}
          onClose={() => setAsking(null)}
          onSave={async (note) => onChanged?.(await workspace.todos.status({ id: todo._id, status: asking.key, note }))}
        />
      )}
      {uploading && (
        <UploadDialog
          title={button.form.resultLabel || 'Upload the PDF'}
          step={resultStep}
          todo={todo}
          onClose={() => setUploading(false)}
          onDone={(answer) => {
            if (answer.nextProblem) warn(`${resultStep.label} — but Production was not asked yet`, answer.nextProblem);
            else toast(`${resultStep.label}`, 'The task is done and Production has its task.');
            onChanged?.(answer.data);
          }}
        />
      )}
      {editing && <ContactDialog fields={editable} todo={todo} onClose={() => setEditing(false)} onSaved={(saved) => onChanged?.(saved)} />}
    </div>
  );
}
