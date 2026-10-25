import { useEffect, useRef, useState } from 'react';
import { workspace } from '../api/endpoints.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { Field, Modal, Notice } from './ui.jsx';
import { Link } from 'react-router-dom';
import TaskPdfLink from './TaskPdfLink.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import TaskDocuments from './TaskDocuments.jsx';
import DepartmentTaskDialog from './DepartmentTaskDialog.jsx';
import CloseTaskPrompt, { offersClose } from './CloseTaskPrompt.jsx';
import DispatchLoadDialog from './DispatchLoadDialog.jsx';
import { dispatchModeOf } from '../utils/dispatchPlan.js';
import RegisterPick from './RegisterPick.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { todayInIndia } from '../utils/taskForm.js';
import { ladderOf } from '../utils/taskState.js';
import { departmentLabel } from '../utils/pipeline.js';
import { ROUTE_LABELS, dateLabelFor, datesOfTask, givenDateOf, goodsOf, handOverDefault, handOverWarning, modelStatusesOf, modelThrough, modelsForStep, modelsOfTask, movesByModel, needsRouting, nextStepForModel, pathOf, routeOf, statusesFor, statusesForModel } from '../utils/edd.js';
import { formatDate } from '../utils/format.js';
import { plantLead } from '../utils/plantSettings.js';

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
export function MoveForm({ todo, form, step, onCancel, onMoved, noDates = false, fixedModels = null }) {
  /*
   * The date already given starts the box: the hand-over date to Printing / Assembly while this
   * team hands on, else the date it gave its models — if it is not past. Sent again only when
   * changed, so a status move does not re-tell the next team a date it already has.
   */
  const given = fixedModels?.length === 1 ? datesOfTask(todo)[fixedModels[0]] || givenDateOf(todo) : givenDateOf(todo);
  /* A hand-over with no date yet starts five days before the EDD [utils/edd.js `handOverDefault`]. */
  const handing = Boolean(step.handsTo);
  const fresh = (day) => (day && day >= todayInIndia() ? day : '');
  const initialDate = step.date === 'tomorrow' ? tomorrowInIndia() : fresh(given) || (handing ? handOverDefault(todo, fixedModels?.length === 1 ? fixedModels[0] : null, undefined, plantLead()) : '');
  const [date, setDate] = useState(initialDate);
  /* Several models on the move: a date for each, with one box to set them all [server: `setTaskStatus` dates]. */
  const [perModel, setPerModel] = useState(() => Object.fromEntries(modelsOfTask(todo).map((model) => [model, fresh(datesOfTask(todo)[model]) || (handing ? handOverDefault(todo, model, undefined, plantLead()) : '') || initialDate])));
  const [note, setNote] = useState('');
  /* What this move records [server: departmentTaskForms `statuses[].fields`] — who collected a sample, say. */
  const asks = step.fields || [];
  const [answers, setAnswers] = useState(() => Object.fromEntries(asks.map((field) => [field.key, ''])));
  /* Several models: the move is for the ones ticked — every one by default, a hand-over only those routed there.
     On one model's own workflow [ModelWorkflows] the models are fixed and no boxes are drawn. */
  const byModel = movesByModel(todo);
  const allModels = byModel ? modelsOfTask(todo) : [];
  const [picked, setPicked] = useState(() => (fixedModels || (byModel ? modelsForStep(todo, step) : [])));
  const whereNow = Object.fromEntries(modelStatusesOf(todo).map((row) => [row.model, form.statuses?.find((entry) => entry.key === row.status)?.label || row.status]));
  const noModel = byModel && !picked.length;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  /* Production gives no date until it has said what follows moulding [TaskRouting]; a team that hands on gives a hand-over date. */
  const unrouted = needsRouting(todo) && Boolean(form.statusDate);
  /* On Production's task only the Production in charge gives a date [server: `assertPlansProduction`]. */
  const dated = Boolean(form.statusDate) && !unrouted && !noDates;
  /* Per model: a model that ends on this team gives its completion date, not a hand-over [utils/edd.js `dateLabelFor`]. */
  const dateLabel = dateLabelFor(todo, form.statusDate?.label || 'Ready date', fixedModels || (byModel ? picked : []));
  const dateModels = fixedModels || (byModel ? picked : modelsOfTask(todo));
  const eachModel = dated && dateModels.length > 1;
  const sameForAll = eachModel && new Set(dateModels.map((model) => perModel[model] || '')).size === 1;
  const dateNeeded = step.date === 'required' && (eachModel ? dateModels.some((model) => !perModel[model]) : !date);
  const remarkNeeded = (form.remarkRequired || step.comment) && note.trim().length < 3;
  const fieldMissing = asks.find((field) => field.required && !String(answers[field.key] || '').trim());
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const fields = Object.fromEntries(asks
      .filter((field) => String(answers[field.key] ?? '').trim() !== '')
      .map((field) => [field.key, field.type === 'number' ? Number(answers[field.key]) : String(answers[field.key]).trim()]));
    try {
      onMoved(await workspace.todos.status({
        id: todo._id, status: step.key, note,
        ...(eachModel
          ? (sameForAll
            ? (perModel[dateModels[0]] && (perModel[dateModels[0]] !== given || step.date) ? { date: perModel[dateModels[0]] } : {})
            : { dates: dateModels.filter((model) => perModel[model]).map((model) => ({ model, date: perModel[model] })) })
          : (date && dated && (date !== given || step.date) ? { date } : {})),
        ...(asks.length ? { fields } : {}),
        ...(fixedModels || (byModel && picked.length < allModels.length) ? { models: picked } : {}),
      }));
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} aria-label={`Move ${fixedModels ? `${fixedModels.join(', ')} ` : ''}to ${step.label}`} className="space-y-2 rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
      <p className="text-xs font-semibold text-steel-200">
        Move {fixedModels ? <span className="text-steel-50">{fixedModels.join(', ')}</span> : null}{fixedModels ? ' to ' : 'to '}{step.label}
        {form.notifyStatus && <span className="font-normal text-steel-400"> · the enquiry’s marketing person and Admin are told</span>}
      </p>
      <div className="grid gap-2">
        {byModel && !fixedModels && (
          <fieldset className="rounded-lg border border-steel-700/60 px-3 py-2">
            <legend className="px-1 text-xs font-medium text-steel-300">Models moving to {step.label}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {allModels.map((model) => (
                <label key={model} className="flex items-center gap-2 text-xs text-steel-200">
                  <input
                    type="checkbox"
                    checked={picked.includes(model)}
                    onChange={(event) => setPicked((current) => (event.target.checked ? [...current, model] : current.filter((entry) => entry !== model)))}
                  />
                  <span className="font-medium">{model}</span>
                  {whereNow[model] && <span className="text-steel-400">· now {whereNow[model]}</span>}
                </label>
              ))}
            </div>
            {step.done && picked.length < allModels.length && <p className="mt-1 text-xs text-steel-400">The task stays open until every model is closed.</p>}
          </fieldset>
        )}
        {asks.map((field) => (
          <Field key={field.key} label={field.label} required={field.required}>
            {field.options ? (
              <select
                className="input"
                required={field.required ? true : undefined}
                value={answers[field.key]}
                onChange={(event) => setAnswers((current) => ({ ...current, [field.key]: event.target.value }))}
              >
                <option value="">Choose…</option>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              step={field.type === 'number' ? 'any' : undefined}
              min={field.type === 'number' ? 0 : undefined}
              className="input"
              required={field.required ? true : undefined}
              value={answers[field.key]}
              onChange={(event) => setAnswers((current) => ({ ...current, [field.key]: event.target.value }))}
            />
            )}
          </Field>
        ))}
        {dated && !eachModel && (
          <Field label={dateLabel} required={step.date === 'required'} hint={handing ? handOverWarning(todo, fixedModels?.[0] || null, date, plantLead()) || undefined : undefined}>
            <input type="date" className="input" min={todayInIndia()} value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
        )}
        {eachModel && (
          <fieldset className="space-y-1.5 rounded-lg border border-steel-700/60 px-3 py-2" aria-label={`${dateLabel} for each model`}>
            <legend className="px-1 text-xs font-medium text-steel-300">{dateLabel} — each model, or one for all</legend>
            <label className="flex flex-wrap items-center gap-2 text-xs text-steel-300">
              <span className="font-semibold">Same for all</span>
              <input type="date" className="input w-auto py-1.5" min={todayInIndia()} value={sameForAll ? perModel[dateModels[0]] || '' : ''}
                onChange={(event) => setPerModel((current) => ({ ...current, ...Object.fromEntries(dateModels.map((model) => [model, event.target.value])) }))} />
            </label>
            {dateModels.map((model) => {
              const label = dateLabelFor(todo, form.statusDate?.label || 'Ready date', model);
              const warning = /^Hand-over/.test(label) ? handOverWarning(todo, model, perModel[model], plantLead()) : null;
              return (
                <label key={model} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm text-steel-200">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{model}</span>
                    <span className="block text-xs font-normal text-steel-400">{label}</span>
                    {warning && <span className="block text-xs font-normal text-warn-400">{warning}</span>}
                  </span>
                  <input type="date" aria-label={`${label} for ${model}`} className="input py-1.5" min={todayInIndia()} value={perModel[model] || ''} onChange={(event) => setPerModel((current) => ({ ...current, [model]: event.target.value }))} />
                </label>
              );
            })}
          </fieldset>
        )}
        <Field label={form.remark?.label || 'Remarks'} required={form.remarkRequired}>
          <textarea rows={2} className="input" placeholder={form.remark?.placeholder || ''} value={note} onChange={(event) => setNote(event.target.value)} autoFocus={!asks.length} />
        </Field>
      </div>
      {unrouted && step.date && <p className="text-xs text-warn-400">Decide printing and assembly for each model first (above the status) — then give the date.</p>}
      {dateNeeded && !unrouted && <p className="text-xs text-warn-400">Give the {dateLabel.toLowerCase()} for {step.label}</p>}
      {fieldMissing && <p className="text-xs text-warn-400">Fill in {fieldMissing.label.toLowerCase()} for {step.label}</p>}
      {noModel && <p className="text-xs text-warn-400">Tick at least one model</p>}
      {step.tellBuyer && <p className="text-xs text-steel-400">This sends the buyer a WhatsApp and email from the company number.</p>}
      {step.confirmsInward && <p className="text-xs text-steel-400">It goes on Accounts’ Payments to confirm list. When Accounts confirms it in the bank, this task reads Paid and closes — or Part Paid, open for the rest.</p>}
      {step.done && step.fields?.length > 0 && form.documents?.length > 0 && (
        <p className="text-xs text-steel-400">Attach the {form.documents.map((doc) => doc.label.toLowerCase()).join(' or ')} under Documents, now or afterwards; it is kept on the record.</p>
      )}
      {problem && <Notice tone="danger">{problem}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || dateNeeded || remarkNeeded || noModel || Boolean(fieldMissing) || (unrouted && Boolean(step.date))}>{busy ? 'Saving…' : 'Update status'}</button>
      </div>
    </form>
  );
}

const PDF_LIMIT = 1024 * 1024;

/** The task's file has gone to the buyer: its status is the one sending sets, or later [server: `markResultSent`]. */
export const resultSent = (todo, statuses = []) => {
  const at = statuses.findIndex((entry) => entry.sent);
  const now = statuses.findIndex((entry) => entry.key === todo?.status);
  return at >= 0 && now >= at;
};

export function CommentDialog({ step, target, onClose, onSave }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  /* What the comment goes with: a question to the enquiry's marketing person, or another
     department's task (Disputed → A/C Clarify; Escalated to PRT → the PRT case), or just a note. */
  const asksMarketing = step.raises && (!target || target.department === 'owner');
  const description = asksMarketing
    ? 'The enquiry’s marketing person gets a task to answer this; their answer comes back onto this task.'
    : step.raises
      ? `${target.label} is raised for ${departmentLabel(target.department)} with this note${step.done ? ', and this task closes' : ''}.`
      : undefined;
  const label = asksMarketing ? 'What needs clarifying' : step.raises ? `What ${departmentLabel(target.department)} should know` : 'Why';
  const button = asksMarketing ? 'Ask marketing' : step.label;
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
    <Modal open title={step.label} description={description} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label={label} required>
          <textarea rows={3} className="input" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || note.trim().length < 3}>{busy ? 'Saving…' : button}</button>
        </div>
      </form>
    </Modal>
  );
}

export function UploadDialog({ title, step, todo, form, reads = false, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const tooBig = file && file.size > PDF_LIMIT;
  /* The SO is a PDF; the LR copy may be a photo of it [server: departmentTaskForms `resultTypes`]. */
  const types = form.resultTypes || ['application/pdf'];
  const takesPhoto = types.some((type) => type.startsWith('image/'));
  const notPdf = file && !types.includes(file.type);
  const what = form.resultTitle || 'Sales order';
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
    <Modal
      open
      title={title}
      description={form.sendResult
        ? `Marks the task ${step.label}, and sends the ${what} to the buyer by email and WhatsApp.`
        : `Marks the task ${step.label}${step.done ? ' and finishes it' : ''}${step.next ? ' — the enquiry moves on to Production' : ''}.`}
      onClose={onClose}
    >
      <form onSubmit={upload} className="space-y-4">
        <Field
          label={takesPhoto ? `${what} — PDF or photo` : `${what} PDF`}
          required
          hint={takesPhoto ? 'PDF, JPEG or PNG, 1 MB at most' : 'PDF, 1 MB at most'}
          error={tooBig ? 'That file is over 1 MB' : notPdf ? (takesPhoto ? 'Attach a PDF or a JPEG / PNG photo' : 'Attach a PDF') : undefined}
        >
          <input type="file" accept={types.join(',')} required className="input" onChange={(event) => setFile(event.target.files?.[0] || null)} autoFocus />
        </Field>
        <Field label="Note" hint={form.sendResult ? 'Optional — the LR number, transporter' : 'Optional — the SO number, anything Production should know'}>
          <input className="input" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !file || tooBig || notPdf}>{busy ? (reads ? 'Reading the SO and drafting the order…' : 'Uploading…') : form.sendResult ? 'Upload and send to buyer' : step.done ? 'Upload and finish' : 'Upload'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ContactDialog({ fields, todo, title = 'Edit contact details', onClose, onSaved }) {
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
    <Modal open title={title} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {fields.map((field) => (
          <Field key={field.key} label={field.label}>
            <input
              type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
              step={field.type === 'number' ? 'any' : undefined}
              className="input"
              value={values[field.key]}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
            />
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

/**
 * The hanger's details on a task raised without them — model, material & colour, hook, clip,
 * print, pieces — picked from the registers [server: departmentTaskForms `HANGER_DETAILS`].
 * Filled by the department working it, whoever raised it, its marketing person or Admin.
 */
export function DetailsDialog({ fields, todo, onClose, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.key, todo.brief?.[field.key] == null ? '' : String(todo.brief[field.key])])));
  const [registers, setRegisters] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    let live = true;
    workspace.todos.registers().then((data) => live && setRegisters(data)).catch(() => live && setRegisters({}));
    return () => { live = false; };
  }, []);
  const set = (key) => (value) => setValues((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await workspace.todos.brief({ id: todo._id, brief: values }));
      onClose();
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal open title="Hanger details" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <p className="text-xs text-steel-400">What the task is about — the team working it, whoever raised it and its marketing person are told.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <Field key={field.key} label={field.label}>
              {field.register && registers?.[field.register]
                ? <RegisterPick field={field} register={registers[field.register]} value={values[field.key]} onChange={set(field.key)} />
                : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    step={field.type === 'number' ? 'any' : undefined}
                    min={field.type === 'number' ? 0 : undefined}
                    className="input"
                    value={values[field.key]}
                    onChange={(event) => set(field.key)(event.target.value)}
                  />
                )}
            </Field>
          ))}
        </div>
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** The details a hanger task cannot do without, missing from its brief. */
export const missingDetails = (todo, fields = []) => (fields.length
  ? ['model', 'material', 'quantity'].filter((key) => fields.some((field) => field.key === key) && !String(todo.brief?.[key] ?? '').trim())
  : []);

const QC_KINDS = ['quality_check', 'quality_issue'];

/**
 * One workflow per model on a Production, Printing or Assembly task of several models
 * [server: handoff.service `setTaskStatus` with `models`; Todo `modelStatuses`]: each model has
 * its own status, its own next step and its own list of moves — Handed to Printing only where
 * that model goes to Printing — so one model can be moulded and handed on while another has not
 * started. A move here is sent for that model alone; the task reads its slowest model.
 */
function ModelWorkflows({ todo, form, statuses, offered, noDates, onMoved }) {
  const [moving, setMoving] = useState(null);
  const dates = datesOfTask(todo);
  const rows = modelStatusesOf(todo);
  /* Printing's and Assembly's goods come from the team before: the day each model came, or when it is due [server: handoff.service `handOn`]. */
  const after = todo.kind !== 'ask_edd';
  const received = todo.routing?.receivedModels || {};
  const incoming = todo.routing?.incoming || {};
  const fromOf = (route) => (todo.kind === 'ask_assembling_edd' && route?.printing ? 'printing' : 'production');
  /* The enquiry's dispatch plan: each model goes as soon as it is ready, or all go together [server: Enquiry `dispatchPlan`]. */
  const eachAsReady = dispatchModeOf(todo.enquiry) === 'by_model';
  return (
    <ul className="space-y-2" aria-label="Workflow by model">
      {rows.map((row) => {
        const own = statusesForModel(todo, offered, row.model);
        const current = statuses.find((entry) => entry.key === row.status) || null;
        const through = modelThrough(statuses, row.status);
        /* Closed here: Task Closed, or the model gone on from this team — handed over, or ready for dispatch from the last team [server: handoff.service `closesModel`]. */
        const closed = Boolean(current?.done || current?.handsTo || current?.readyForDispatch);
        const next = nextStepForModel(todo, statuses, row.model, row.status);
        const nextIsButton = next && own.some((entry) => entry.key === next.key) && !next.pdf && !(noDates && (next.date || next.plans));
        const route = routeOf(todo, row.model);
        const date = dates[row.model];
        const open = moving?.model === row.model ? moving.step : null;
        return (
          <li key={row.model} className={`rounded-xl border p-3 ${closed ? 'border-line/[0.06] opacity-80' : through ? 'border-success-500/30 bg-success-500/[0.04]' : current?.issue ? 'border-danger-500/40 bg-danger-500/[0.04]' : 'border-line/[0.08] bg-line/[0.02]'}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-bold text-steel-50">{row.model}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${closed || through ? 'bg-success-500/15 text-success-400' : current?.issue ? 'bg-danger-500/15 text-danger-400' : 'bg-warn-500/10 text-warn-400'}`}>
                {current?.label || 'Not started'}
              </span>
              {route && <span className="text-xs text-steel-400">{pathOf(route)}</span>}
              {date && <span className="text-xs text-steel-300">{dateLabelFor(todo, form.statusDate?.label || 'Ready date', row.model)} {formatDate(date)}</span>}
              {closed && !current?.done && <span className="text-xs font-semibold text-success-400">closed here for this model</span>}
            </div>
            {/* Where the goods are for this model: came on a day, or still with the team before. */}
            {after && !closed && (
              <p className="mt-1 text-xs text-steel-400">
                {received[row.model]
                  ? `Goods came ${formatDate(received[row.model])} from ${ROUTE_LABELS[fromOf(route)]}${goodsOf(todo, row.model, statuses, row.status)?.stage === 'received' ? ' — not yet in the work queue' : ''}`
                  : `Still with ${ROUTE_LABELS[fromOf(route)]}${incoming[fromOf(route)] ? `, due ${formatDate(incoming[fromOf(route)])}` : ''}`}
              </p>
            )}
            {/* Ready here: whether it goes to Dispatch on its own, or waits for the rest — marketing's plan on the enquiry. */}
            {current?.readyForDispatch && todo.enquiry && (
              <p className={`mt-1 text-xs ${eachAsReady ? 'text-success-400' : 'text-warn-400'}`}>
                {eachAsReady ? 'Goes to Dispatch as soon as it is ready — dispatch plan: each model as it is ready.' : 'Waits for the other models — dispatch plan: all together. Marketing or Admin can change it on the enquiry.'}
              </p>
            )}
            {!closed && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {nextIsButton && (
                  <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => setMoving({ model: row.model, step: next })}>
                    {next.label} →
                  </button>
                )}
                <label className="sr-only" htmlFor={`status-${todo._id}-${row.model}`}>Status of {row.model}</label>
                <select
                  id={`status-${todo._id}-${row.model}`}
                  aria-label={`Change status of ${row.model}`}
                  className="input w-auto min-w-[11rem] py-1 text-xs"
                  value={open?.key || row.status || ''}
                  onChange={(event) => {
                    const step = own.find((entry) => entry.key === event.target.value);
                    setMoving(step && step.key !== row.status ? { model: row.model, step } : null);
                  }}
                >
                  {own.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
                </select>
              </div>
            )}
            {open && (
              <div className="mt-2">
                <MoveForm
                  key={`${row.model}-${open.key}`}
                  todo={todo}
                  form={form}
                  step={open}
                  noDates={noDates}
                  fixedModels={[row.model]}
                  onCancel={() => setMoving(null)}
                  onMoved={(saved) => { setMoving(null); onMoved(saved, open, row.model); }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The status list and the workflow's actions, for a task whose department has a workflow. */
/** What became of the sales order the SO request booked [server: soFromTask.service]. */
const orderWords = (order) => (order?.said ? `Sales order ${order.said}.` : '');

/**
 * Printing's and Assembly's goods coming in [server: handoff.service `handOn`, `addToWorkQueue`]:
 * the models received and not yet taken on, with Add to work queue; and, on a task Production
 * routed, the models still with the team before — no work is offered on them until they come.
 */
function GoodsIn({ todo, statuses, onMoved }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  if (!['ask_printing', 'ask_assembling_edd'].includes(todo.kind)) return null;
  const models = modelsOfTask(todo);
  if (!models.length) return null;
  const rows = modelStatusesOf(todo);
  const statusOfModel = (model) => rows.find((row) => row.model === model)?.status || todo.status;
  const goods = models.map((model) => ({ model, ...goodsOf(todo, model, statuses, statusOfModel(model)) }));
  const toQueue = goods.filter((entry) => entry.stage === 'received');
  const toCome = todo.routing?.byProduction ? goods.filter((entry) => entry.stage === 'to_come') : [];
  if (!toQueue.length && !toCome.length) return null;
  const from = todo.kind === 'ask_assembling_edd' ? 'Production or Printing' : 'Production';
  const add = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onMoved(await workspace.todos.workQueue({ id: todo._id, models: toQueue.map((entry) => entry.model) }));
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1.5 rounded-lg border border-line/[0.08] bg-line/[0.02] px-3 py-2 text-xs" aria-label="Goods">
      {toQueue.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-steel-200">
            <span className="font-semibold text-accent">Goods received</span>
            {' — '}{toQueue.map((entry) => `${entry.model} (${formatDate(entry.came)})`).join(', ')}
          </p>
          <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={busy} onClick={add}>
            {busy ? 'Adding…' : 'Add to work queue'}
          </button>
        </div>
      )}
      {toCome.length > 0 && (
        <p className="text-warn-400">
          Still with {from}: {toCome.map((entry) => entry.model).join(', ')} — work on {toCome.length > 1 ? 'them' : 'it'} once the goods come (handed over, or mark Goods Received when they reach you).
        </p>
      )}
      {problem && <p className="text-danger-400" role="alert">{problem}</p>}
    </div>
  );
}

export default function TaskWorkflow({ todo, onChanged, startWith }) {
  const { canWrite, mayPlanProduction } = useAuth();
  const catalogue = useHandoffCatalogue();
  /*
   * Production's plan is the Production in charge's: the rest of Production is not offered a
   * status that plans (EDD Accepted, Planning) or sets a date (Ready Tomorrow, Ready on Selected
   * Date), nor a date box with a move.
   */
  const noDates = todo?.kind === 'ask_edd' && !mayPlanProduction;
  const button = buttonFor(catalogue, todo?.kind);
  /* Handed to Printing / Assembly only where a model goes there. */
  const statuses = statusesFor(todo, button?.form?.statuses || []);
  const [asking, setAsking] = useState(null);
  const [moving, setMoving] = useState(null);
  /* Dispatch's "Ask Production": the other department's form, filled from the enquiry. */
  const [askingDepartment, setAskingDepartment] = useState(null);
  const [uploading, setUploading] = useState(false);
  /* Part Quantity Dispatched, Fully Dispatched, Dispatched: the dispatch form [DispatchLoadDialog]. */
  const [loading, setLoading] = useState(null);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  /* Several models: each has its own workflow [ModelWorkflows]; moving every model at once is opened on request. */
  const [allAtOnce, setAllAtOnce] = useState(false);
  const [fillingDetails, setFillingDetails] = useState(false);
  const [problem, setProblem] = useState(null);
  /* The task as a move left it with nothing more to do: the offer to close it [CloseTaskPrompt]. */
  const [offer, setOffer] = useState(null);
  /* Said as a toast: the finished task leaves the list it was on. */
  const { toast, warn } = useToast();
  /* After a move: the screen takes the task as saved; if nothing is left on it, the dialog to close it. */
  const moved = (saved) => {
    onChanged?.(saved);
    if (offersClose(saved)) setOffer(saved);
  };
  /* Opened from a status picked elsewhere (the Department Tasks table): go straight to that move. */
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !startWith || !statuses.length || todo?.completed || startWith === todo?.status) return;
    started.current = true;
    choose(startWith);
  });
  if (!statuses.length) return null;

  const current = statuses.find((entry) => entry.key === todo.status);
  /* The readiness tasks this one asked for and are still open. */
  const waiting = (todo.waitingOn || []).filter((task) => (button.form.actions || []).some((action) => (action.kind === task.kind || action.was === task.kind) && action.waits));
  const resultStep = statuses.find((entry) => entry.pdf);
  const editable = (button.asks || []).filter((field) => field.editable);
  /* The hanger's details — model, material, parts, pieces — filled on a task raised without them. */
  const details = (button.details || []).filter((field) => !editable.some((entry) => entry.key === field.key));
  const missing = missingDetails(todo, details);
  /* The obvious move — the rung after the one the task stands on — as the one big button. */
  const next = ladderOf(button, todo)?.next;
  const nextIsButton = next && !next.pdf && !waiting.length && !(noDates && (next.date || next.plans));
  /* The statuses this person may pick — where the task stands is always listed, so the list reads it. */
  const offered = noDates ? statuses.filter((entry) => (!entry.date && !entry.plans) || entry.key === todo.status) : statuses;

  if (todo.completed) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-success-500/15 px-2.5 py-1 font-semibold text-success-400">{current?.label || 'Done'}</span>
        <TaskPdfLink file={todo.resultFile} />
        <TaskDocuments todo={todo} kinds={button.form.documents} />
      </div>
    );
  }

  /* Reception sends the LR copy already on the task — Dispatch uploaded it with the load. */
  const sendToBuyer = async () => {
    setSending(true);
    setProblem(null);
    try {
      const answer = await workspace.todos.sendResult(todo._id);
      const channel = (entry) => (entry.channel === 'email' ? 'Email' : 'WhatsApp');
      const went = (answer.sent || []).filter((entry) => entry.status === 'sent');
      const missed = (answer.sent || []).filter((entry) => entry.status !== 'sent');
      if (went.length) toast(`${button.form.resultTitle || 'File'} sent to the buyer`, went.map((entry) => `${channel(entry)} to ${entry.recipient}`).join(' · '));
      if (missed.length) warn(`${missed.map(channel).join(' and ')} not sent`, missed.map((entry) => `${channel(entry)}: ${String(entry.reason || entry.status).replaceAll('_', ' ')}`).join(' · '));
      onChanged?.(answer.data);
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setSending(false);
    }
  };

  const choose = async (key) => {
    const step = statuses.find((entry) => entry.key === key);
    setProblem(null);
    /* A load is said from the dispatch form: the models and pieces, how it travels, its LR copy or proof of delivery. */
    if (step.loads) return setLoading(step);
    if (step.pdf) return setUploading(true);
    /* A comment alone is the small dialog; one that also asks something (PRT to collect a cheque or follow up) is the form. */
    if (step.comment && !step.fields?.length) return setAsking(step);
    /* A workflow whose every move says why, or says when — or a move that records something
       (who collected the sample) or tells the buyer: the form first. */
    /* Several models: always the form, to say which models move. */
    if (button.form.remarkRequired || button.form.statusDate || step.fields?.length || step.tellBuyer || movesByModel(todo)) return setMoving(key === todo.status && !movesByModel(todo) ? null : step);
    try {
      moved(await workspace.todos.status({ id: todo._id, status: key }));
    } catch (failure) {
      setProblem(failure.message);
    }
    return null;
  };

  return (
    <div className="space-y-2">
      {/* Nothing left to do here [server: taskClosable.service]: the task says so until somebody closes it. */}
      {offersClose(todo) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-success-500/10 px-3 py-2 ring-1 ring-success-500/20" role="status">
          <p className="text-xs text-success-400"><span className="font-semibold">Nothing left to do</span> — {todo.closable.why}</p>
          <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => setOffer(todo)}>Close the task</button>
        </div>
      )}
      {/* Printing / Assembly: what came and is waiting to be taken on, and what is still to come. */}
      <GoodsIn todo={todo} statuses={button?.form?.statuses || []} onMoved={moved} />
      {/* Several models: one workflow each — a model moulded and handed to Printing while another has not started. */}
      {movesByModel(todo) && !waiting.length && (
        <>
          <ModelWorkflows
            todo={todo}
            form={button.form}
            statuses={statuses}
            offered={offered}
            noDates={noDates}
            onMoved={(saved, step, model) => {
              if (saved?.completed) toast(step.label, 'The task is finished — every model has gone on from this team.');
              /* The model has left this team: its share of the task closes, and marketing and Admin are alerted [server: `closesModel`]. */
              else if (step.handsTo || step.readyForDispatch) toast(`${model} closed here`, `${step.label} — marketing and Admin are told.`);
              moved(saved);
            }}
          />
          <button type="button" className="link-muted text-xs" onClick={() => setAllAtOnce((value) => !value)} aria-expanded={allAtOnce}>
            {allAtOnce ? 'Hide the move for every model' : 'Move every model together'}
          </button>
        </>
      )}
      {(!movesByModel(todo) || allAtOnce || waiting.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {nextIsButton && !movesByModel(todo) && (
            <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => choose(next.key)}>
              {next.label} →
            </button>
          )}
          <label className="sr-only" htmlFor={`status-${todo._id}`}>{movesByModel(todo) ? 'Status of every model' : 'Status update'}</label>
          <select
            id={`status-${todo._id}`}
            aria-label={movesByModel(todo) ? 'Change status of every model' : 'Change status'}
            className="input w-auto min-w-[11rem] py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-80"
            value={moving?.key || todo.status || ''}
            disabled={waiting.length > 0}
            aria-describedby={waiting.length ? `waiting-${todo._id}` : undefined}
            onChange={(event) => choose(event.target.value)}
          >
            {offered.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </div>
      )}
      {/* Asked Production / Assembly for readiness: theirs to answer, so the status waits on it [server: `assertNotWaiting`]. */}
      {waiting.length > 0 && (
        <p id={`waiting-${todo._id}`} className="rounded-lg bg-warn-500/10 px-3 py-2 text-xs text-warn-400 ring-1 ring-warn-500/20">
          Waiting on {waiting.map((task) => {
            const said = buttonFor(catalogue, task.kind)?.form?.statuses?.find((entry) => entry.key === task.status)?.label;
            return `${departmentLabel(task.department)}${said ? ` — ${said}` : ''}`;
          }).join(' and ')}.
          {' '}The status can be changed once {waiting.length > 1 ? 'those tasks are' : 'that task is'} closed.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {editable.length > 0 && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setEditing(true)}>{button.form.editLabel || 'Edit contact details'}</button>
        )}
        {details.length > 0 && !todo.completed && (
          <button
            type="button"
            className={`${missing.length ? 'btn-primary' : 'btn-secondary'} px-3 py-1.5 text-xs`}
            title={missing.length ? `Not given: ${missing.join(', ')}` : undefined}
            onClick={() => setFillingDetails(true)}
          >
            {missing.length ? 'Add hanger details' : 'Edit hanger details'}
          </button>
        )}
        {/* Asking another department raises its task on the enquiry — a team task has none. */}
        {todo.enquiry && (button.form.actions || []).map((action) => (
          <button key={action.kind} type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setAskingDepartment(action)}>
            {action.label}
          </button>
        ))}
        {/* The whole of it — each model, the hand-overs, the work orders — on its workflow page [pages/ProductionWorkflow.jsx]. */}
        {todo.kind === 'ask_edd' && todo.enquiry && !window.location.pathname.startsWith('/production/workflow/') && (
          <Link to={`/production/workflow/${todo._id}`} className="btn-secondary px-3 py-1.5 text-xs">Production workflow</Link>
        )}
        {/* Production's job, on the press: a mould run for this enquiry's SO, started from the task. */}
        {todo.kind === 'ask_edd' && todo.enquiry && canWrite('production') && (
          <Link
            to={`/mould-runs?start=1&enquiry=${todo.enquiry._id || todo.enquiry}${todo.order ? `&order=${todo.order._id || todo.order}` : ''}${todo.enquiry.number ? `&label=${encodeURIComponent(`${todo.enquiry.number}${todo.customer?.name ? ` — ${todo.customer.name}` : ''}`)}` : ''}`}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Start a run
          </Link>
        )}
        {/* A Quality task's test sheet, opened with the task and its enquiry filled in. */}
        {QC_KINDS.includes(todo.kind) && canWrite('quality') && (
          <Link
            to={`/qc-records/new?task=${todo._id}${todo.enquiry ? `&enquiry=${todo.enquiry._id || todo.enquiry}` : ''}&stage=${todo.kind === 'quality_issue' ? 'complaint' : 'pre_dispatch'}`}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Fill a QC record
          </Link>
        )}
        {resultStep && (
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => setUploading(true)}>
            {todo.resultFile && button.form.sendResult ? 'Upload again' : button.form.resultLabel || `Upload PDF — ${resultStep.label}`}
          </button>
        )}
        {/* The LR copy Dispatch uploaded with the load, waiting on this task: Reception sends it to the buyer [server: `handoffSendResult`]. */}
        {button.form.sendResult && todo.resultFile && !resultSent(todo, statuses) && (
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={sending} onClick={sendToBuyer}>
            {sending ? 'Sending…' : `Send ${(button.form.resultTitle || 'file').toLowerCase()} to buyer`}
          </button>
        )}
      </div>
      <TaskDocuments todo={todo} kinds={button.form.documents} />
      {problem && <Notice tone="danger">{problem}</Notice>}
      {moving && (
        <MoveForm
          key={moving.key}
          todo={todo}
          form={button.form}
          step={moving}
          noDates={noDates}
          onCancel={() => setMoving(null)}
          onMoved={(saved) => {
            setMoving(null);
            if (saved?.completed) toast(moving.label, 'The task is finished.');
            moved(saved);
          }}
        />
      )}

      {asking && (
        <CommentDialog
          step={asking}
          target={asking.raises ? buttonFor(catalogue, asking.raises) : null}
          onClose={() => setAsking(null)}
          onSave={async (note) => moved(await workspace.todos.status({ id: todo._id, status: asking.key, note }))}
        />
      )}
      {offer && (
        <CloseTaskPrompt
          task={offer}
          why={offer.closable?.why}
          onClose={() => setOffer(null)}
          onClosed={(saved) => {
            toast('Task closed', offer.closable?.why || 'Nothing was left to do.');
            onChanged?.(saved);
          }}
        />
      )}
      {uploading && (
        <UploadDialog
          title={button.form.resultLabel || 'Upload the PDF'}
          step={resultStep}
          todo={todo}
          form={button.form}
          /* The SO is read and the order drafted from it while this waits [server: soRead.llm]. */
          reads={Boolean(button.booksOrder)}
          onClose={() => setUploading(false)}
          onDone={(answer) => {
            /* Said per channel: which went, and why another did not. */
            const channel = (entry) => (entry.channel === 'email' ? 'Email' : 'WhatsApp');
            const went = (answer.sent || []).filter((entry) => entry.status === 'sent');
            const missed = (answer.sent || []).filter((entry) => entry.status !== 'sent');
            if (answer.sent) {
              if (went.length) toast(`${button.form.resultTitle || 'File'} sent to the buyer`, went.map((entry) => `${channel(entry)} to ${entry.recipient}`).join(' · '));
              if (missed.length) warn(`${missed.map(channel).join(' and ')} not sent`, missed.map((entry) => `${channel(entry)}: ${String(entry.reason || entry.status).replaceAll('_', ' ')}`).join(' · '));
            } else if (answer.held) toast(`${resultStep.label} — held with marketing`, ['Production was not confirmed on the request: it is under Production Holded Orders until Admin or its marketing person moves it on.', orderWords(answer.order)].filter(Boolean).join(' '));
            else if (answer.nextProblem) warn(`${resultStep.label} — but Production was not asked yet`, [answer.nextProblem, orderWords(answer.order)].filter(Boolean).join(' '));
            else toast(`${resultStep.label}`, ['The task is done and Production has its task.', orderWords(answer.order)].filter(Boolean).join(' '));
            /* The request's lines could not become an order: said loudly, so the SO team books it by hand. */
            if (answer.order?.problem) warn('Sales order not booked', `${answer.order.problem}. Book it on the Sales orders screen.`);
            onChanged?.(answer.data);
          }}
        />
      )}
      {loading && (
        <DispatchLoadDialog
          todo={todo}
          onClose={() => setLoading(null)}
          onDone={(saved) => onChanged?.(saved)}
        />
      )}
      {askingDepartment && (
        <DepartmentTaskDialog
          enquiry={{ _id: todo.enquiry?._id || todo.enquiry, customer: todo.customer }}
          catalogue={catalogue}
          kind={askingDepartment.kind}
          fromTask={todo}
          title={askingDepartment.label}
          onClose={() => setAskingDepartment(null)}
          onSent={() => onChanged?.()}
        />
      )}
      {editing && <ContactDialog fields={editable} todo={todo} title={button.form.editLabel} onClose={() => setEditing(false)} onSaved={(saved) => onChanged?.(saved)} />}
      {fillingDetails && <DetailsDialog fields={details} todo={todo} onClose={() => setFillingDetails(false)} onSaved={(saved) => onChanged?.(saved)} />}
    </div>
  );
}
