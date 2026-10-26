import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { handoffs as handoffsApi, orders as ordersApi, workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Field, Modal, Notice } from './ui.jsx';
import { CustomerSelect } from './pickers.jsx';
import RegisterPick from './RegisterPick.jsx';
import { SAMPLE_HANDOVERS } from '../utils/pipeline.js';
import { EDD_ASK_KINDS } from '../utils/edd.js';
import {
  briefToSend, changedDetails, departmentOptions, missingAnswer, noteNeeded, optionOf, optionsOf, prefillValue, startingAnswers, todayInIndia,
} from '../utils/taskForm.js';

/**
 * Assigning a department task from an enquiry [server: config/departmentTaskForms.js].
 *
 * Opens on the department that was clicked — the Workflow / Department list switches to any
 * other — with that department's own form, filled from the enquiry: the models with their mould,
 * material, hook, clip and print; the buyer's contact; the order's quantity and terms. Every
 * answer stays editable. Below the form, what every task takes: a priority, a required date (the
 * task's due date), an optional PDF of 1 MB at most and the instruction.
 *
 * Opened from another department's task (`fromTask` — Dispatch's "Ask Production"), it asks
 * that one department only, says what is needed, and the asking task records it.
 *
 * Opened with no enquiry (`enquiry` null — "New team task" on the dashboard), it is a task for a
 * team on its own: a customer may be picked, and the form fills only what that gives.
 */

const PDF_LIMIT = 1024 * 1024;
const PRIORITIES = [['normal', 'Normal'], ['high', 'High'], ['low', 'Low']];

function Answer({ field, value, prefill, onChange }) {
  const options = optionsOf(field, prefill);
  /*
   * The register's list — moulds, materials, parts — as a dropdown. A question whose choices
   * are the enquiry's own models (Production's "which model") keeps those instead.
   */
  const register = field.register && prefill?.registers?.[field.register];
  if (register && !(field.optionsFrom && options.length)) {
    return <RegisterPick field={field} register={register} value={value} onChange={onChange} />;
  }
  /* A person of a department — the PRT member who visits; the task becomes theirs by name. */
  if (field.type === 'member') {
    const people = prefill?.members?.[field.department] || [];
    return (
      <select className="input" value={value || ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">{people.length ? 'Choose who goes…' : 'Nobody in this team yet — ask Admin to add them'}</option>
        {people.map((person) => <option key={person._id} value={person._id}>{person.name}</option>)}
      </select>
    );
  }
  if (field.type === 'choice') {
    /* How a sample reaches the buyer: what each answer means for who gets the task. */
    const hint = field.key === 'handover' ? SAMPLE_HANDOVERS.find((option) => option.label === value)?.hint : null;
    return (
      <>
        <select className="input" value={value || ''} onChange={(event) => onChange(event.target.value)}>
          <option value="">{field.placeholder || 'Choose…'}</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        {hint && <p className="mt-1 text-xs text-steel-400">{hint}</p>}
      </>
    );
  }
  if (field.type === 'check') {
    return (
      <label className="flex items-center gap-2 text-sm text-steel-200">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {field.label}
      </label>
    );
  }
  return (
    <input
      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
      step={field.type === 'number' ? 'any' : undefined}
      min={field.type === 'number' ? 0 : undefined}
      className="input"
      placeholder={field.placeholder || ''}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A table of rows — a sample's models, each with its parts, colour rule and pieces. */
function Rows({ field, rows, prefill, onChange }) {
  const set = (index, key, value) => onChange(rows.map((row, at) => (at === index ? { ...row, [key]: value } : row)));
  /* A new row starts as the column says (a sample is three pieces), else empty. */
  const blank = Object.fromEntries(field.columns.map((column) => [column.key, column.blank ?? '']));
  return (
    <div className="space-y-3 rounded-xl border border-line/[0.1] bg-line/[0.02] p-3 sm:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-steel-100">
          {field.label}
          <span className="ml-2 text-xs font-normal text-steel-500">Filled from the enquiry — change anything</span>
        </p>
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => onChange([...rows, blank])}>
          {field.add || '+ Add row'}
        </button>
      </div>
      {rows.map((row, index) => (
        /* Rows have no identity until saved, so their place is their key. */
        <div key={index} className="relative grid grid-cols-2 gap-2 rounded-lg border border-line/[0.08] p-2 pr-9 sm:grid-cols-4">
          {field.columns.map((column) => (
            <label key={column.key} className={`text-[0.75rem] text-steel-500 ${['model', 'complaint'].includes(column.key) ? 'col-span-2' : ''}`}>
              {column.label}{column.required ? ' *' : ''}
              <Answer field={column} value={row[column.key]} prefill={prefill} onChange={(value) => set(index, column.key, value)} />
            </label>
          ))}
          {rows.length > 1 && (
            <button
              type="button"
              aria-label={`Remove row ${index + 1}`}
              className="absolute right-2 top-2 rounded-full px-2 text-steel-400 hover:text-danger-400"
              onClick={() => onChange(rows.filter((_, at) => at !== index))}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function DepartmentTaskDialog({ enquiry, catalogue, kind: startKind, fromTask, title, customer: startCustomer, onClose, onSent }) {
  const [kind, setKind] = useState(startKind);
  const [loaded, setPrefill] = useState(null);
  const [runningOrder, setRunningOrder] = useState(null);
  const [stopOk, setStopOk] = useState(false);
  const [answers, setAnswers] = useState({});
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('normal');
  const [requiredDate, setRequiredDate] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  /* The same ask already open for the buyer and model [server: handoff.service `sameOpenJob`]: that job, offered. */
  const [duplicate, setDuplicate] = useState(null);
  const { toast, warn } = useToast();
  const { canWrite, isAdmin, departments = [] } = useAuth();
  /* The EDD — marketing's — asked on the form of a task the queues run by [server: eddAsk.service]. */
  const [edd, setEdd] = useState('');
  const navigate = useNavigate();
  /* No enquiry: a team task, with an optional customer instead of the enquiry's answers. */
  const team = !enquiry;
  /* A team task opened from a customer [components/CustomerPanel.jsx] starts on that buyer. */
  const [customer, setCustomer] = useState(startCustomer || '');
  /*
   * A team task for a buyer starts from their latest enquiry — or, chosen, as a new task of its own:
   * nothing carried over, and every model on the register to pick from rather than the enquiry's.
   */
  const [freshStart, setFreshStart] = useState(false);
  const prefill = useMemo(() => (team && freshStart && loaded
    ? { ...loaded, items: [], orderItems: [], quoteItems: [], modelList: [], models: '', materials: '', quantity: '', targetPrice: '', order: { paymentTerms: '', invoiceNumber: '' }, from: null }
    : loaded), [team, freshStart, loaded]);
  /* An enquiry with more than one SO: which one this task is for (else the server takes the newest). */
  const [orders, setOrders] = useState([]);
  const [order, setOrder] = useState('');
  useEffect(() => {
    let live = true;
    if (team || fromTask) return undefined;
    ordersApi.list({ enquiry: enquiry._id, open: 'true', limit: 20, sort: '-createdAt' }).then((answer) => live && setOrders(answer?.data || [])).catch(() => {});
    return () => { live = false; };
  }, [team, fromTask, enquiry?._id]);

  const buttons = catalogue?.buttons || [];
  const button = buttons.find((entry) => entry.key === kind);
  const form = button?.form || {};
  const choices = useMemo(() => departmentOptions(buttons), [buttons]);

  useEffect(() => {
    let live = true;
    (team ? workspace.teamTasks.prefill(customer || undefined) : handoffsApi.prefill(enquiry._id))
      .then((data) => { if (live) { setPrefill(data || {}); setEdd((current) => current || data?.edd || ''); } })
      .catch(() => { if (live) setPrefill({}); });
    return () => { live = false; };
  }, [team, enquiry?._id, customer]);

  /*
   * A new department: the form starts again from the enquiry. The same department with new
   * answers to fill from (a customer picked on a team task): only the blanks are filled — what
   * the person has already typed stays.
   */
  const startedFor = useRef(null);
  /* What the form started with — the enquiry's details, or the job's latest — to tell a change from it. */
  const [started, setStarted] = useState({});
  /* A detail changed here: the enquiry follows when this stays ticked [server: itemDetails.service]. */
  const [updateEnquiry, setUpdateEnquiry] = useState(true);
  useEffect(() => {
    if (!button || !prefill) return;
    const fresh = startingAnswers(button, prefill);
    if (startedFor.current !== button.key) {
      startedFor.current = button.key;
      setStarted(fresh);
      setAnswers(fresh);
      setRequiredDate(button.key === 'invoice_dispatch' ? todayInIndia() : '');
      return;
    }
    const blank = (value) => value == null || value === '' || (Array.isArray(value) && !value.some((row) => Object.values(row || {}).some((cell) => String(cell ?? '').trim())));
    setAnswers((current) => Object.fromEntries(Object.entries(fresh).map(([key, value]) => [key, blank(current[key]) ? value : current[key]])));
  }, [button, prefill]);

  if (!button) return null;

  /* A list entry is a button's own key (two that share one entry share the first's). */
  const pickDepartment = (value) => setKind(value);
  const answer = (key) => (value) => setAnswers((current) => ({ ...current, [key]: value }));
  const missing = missingAnswer(button, answers);
  /* A team task's answers say what to do; the instruction is for what they do not. */
  const mustExplain = (noteNeeded(button, answers) || Boolean(fromTask)) && note.trim().length < 3;
  const tooBig = file && file.size > PDF_LIMIT;
  const notPdf = file && file.type !== 'application/pdf';
  /*
   * Production, Printing, Assembly, Dispatch: their queues run by the EDD, so marketing or Admin
   * raising one gives it here — the enquiry's EDD filled in, required when there is none yet.
   */
  const asksEdd = EDD_ASK_KINDS.includes(kind) && !fromTask && (isAdmin || departments.includes('marketing'));
  const eddMissing = asksEdd && !edd;
  const changes = team ? [] : changedDetails(started, answers);
  /*
   * A new SO request on an enquiry whose order is already in production [server: handoff.service
   * `sendHandoff`]: said before anything else, and sent only once ticked — that production stops,
   * marketing and Admin are told, and the plant follows the revised SO.
   */
  const running = !team && !fromTask && kind === 'po_so' ? runningOrder || prefill?.orderInProduction || null : null;
  const blocked = !prefill || Boolean(missing) || mustExplain || tooBig || notPdf || eddMissing || (orders.length > 1 && !order && !fromTask && !team) || (running && !stopOk);

  const submit = async (event, { anyway = false } = {}) => {
    event?.preventDefault();
    setBusy(true);
    setProblem(null);
    setDuplicate(null);
    try {
      /* A department that already has this task open gets the request added to it. */
      const payload = {
        kind, note, brief: briefToSend(button, answers),
        ...(changes.length && updateEnquiry ? { updateEnquiry: true } : {}),
        ...(form.priority ? { priority } : {}),
        ...(requiredDate ? { requiredDate } : {}),
        /* Sent when given here or changed from the enquiry's — it becomes the enquiry's (or the job's) EDD. */
        ...(asksEdd && edd && edd !== (prefill?.edd || '') ? { edd } : {}),
        ...(asksEdd && edd && team ? { edd } : {}),
        ...(running && stopOk ? { revise: true } : {}),
      };
      const sent = fromTask
        ? await workspace.todos.ask({ id: fromTask._id, ...payload }).then((answer) => ({ task: answer.raised, addedTo: answer.addedTo }))
        : team
          ? await workspace.teamTasks.create({ ...payload, ...(customer ? { customer } : {}), ...(anyway ? { allowDuplicate: true } : {}) })
          : await handoffsApi.send({ id: enquiry._id, addToOpen: true, ...payload, ...(order ? { order } : {}) });
      if (team) toast(`Sent to ${form.team || 'the team'}`, 'It is on their dashboard now — no enquiry needed.');
      /* A sample the buyer collects at reception is internal: Reception has it, not the sampling queue. */
      if (!team && sent.task?.kind === 'sample_collect' && !sent.addedTo) toast('Sent to Reception', 'An internal sample — Reception gets it ready and hands it over; it does not go to the sampling queue.');
      /* Handed over by the marketing person from the rack: noted on the enquiry, no task for Sampling. */
      if (!team && sent.task?.kind === 'sample_request' && sent.task?.completed) toast('Noted on the enquiry', 'No task for Sampling — the sample is ready from the rack. Mark it handed over on the enquiry once it is with the buyer.');
      if (fromTask && !sent.addedTo) toast(`${form.team || 'The department'} asked`, 'Their task is raised, and this task says so.');
      if (sent.addedTo) {
        toast(`Added to ${form.team || 'the department'}’s open task`, 'They already had this task — your request is on it as an update.');
        if (file) warn('The PDF was not attached', 'Attach it on the task they already have, or send it in the note.');
        onSent();
        onClose();
        return;
      }
      if (file) {
        try {
          if (team) await workspace.teamTasks.attach({ id: sent.task._id, file });
          else await handoffsApi.attach({ id: enquiry._id, taskId: sent.task._id, file });
        } catch (failure) {
          onSent();
          setProblem(`The task was sent, but the PDF did not attach: ${failure.message}`);
          setBusy(false);
          return;
        }
      }
      onSent();
      onClose();
      /*
       * Create Quotation raises the costing sheet on the enquiry. Somebody who costs quotations
       * themselves is usually about to open it, so they land on it rather than finding it on the
       * list [server: handoff.controller `send` carries the quotation].
       */
      if (sent.quotation?._id && canWrite('pricing')) navigate(`/quotations/${sent.quotation._id}`);
    } catch (failure) {
      /* Production started since the form opened: the alert, rather than a bare refusal. */
      if (failure.details?.code === 'SO_IN_PRODUCTION') setRunningOrder({ ...failure.details.order, words: failure.message });
      else if (failure.details?.code === 'DUPLICATE_JOB') setDuplicate({ ...failure.details.job, words: failure.message });
      else setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  let section = null;
  return (
    <Modal open title={title || (team ? 'New team task' : form.title) || 'Assign department task'} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer / Company" hint={team ? 'Optional — a team task needs no enquiry' : undefined}>
            {team
              ? <CustomerSelect value={customer} onChange={(value) => setCustomer(value?._id || value || '')} allowCreate={false} emptyLabel="No customer" />
              : <input className="input" value={enquiry.customer?.name || prefill?.customer?.name || ''} readOnly />}
          </Field>
          <Field label="Workflow / Department">
            {/* Asked from a task, the department is the ask's own — a readiness query is not one of the tiles. */}
            {fromTask
              ? <input className="input" value={form.team || button?.label || ''} readOnly aria-label="Department asked" />
              : (
                <select className="input" value={optionOf(button)} onChange={(event) => pickDepartment(event.target.value)}>
                  {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                </select>
              )}
          </Field>

          {running && (
            <div className="rounded-xl border border-danger-500/50 bg-danger-500/[0.08] p-3 sm:col-span-2" role="alert" aria-label="Order already in production">
              <p className="text-sm font-bold text-danger-400">⚠ {running.number} is already in production</p>
              <p className="mt-1 text-xs text-steel-200">{running.words}</p>
              <p className="mt-1 text-xs text-steel-400">The enquiry’s marketing person and Admin are told. The same SO is revised from this request — no second order.</p>
              <label className="mt-2 flex items-start gap-2 text-sm font-semibold text-steel-100">
                <input type="checkbox" className="mt-0.5" checked={stopOk} onChange={(event) => setStopOk(event.target.checked)} />
                Stop that production and send this SO request
              </label>
            </div>
          )}
          {!prefill && <p className="text-sm text-steel-400 sm:col-span-2">Filling the form from the enquiry…</p>}
          {/* A team task for a buyer: the rows come from their latest enquiry [server: `teamTaskPrefill`] — or it starts as a new task. */}
          {team && loaded?.from?.enquiry && (
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2" role="radiogroup" aria-label="Start from">
              {[[false, `From ${loaded.from.enquiry.number}`], [true, 'New task — any model']].map(([value, label]) => (
                <button key={label} type="button" role="radio" aria-checked={freshStart === value}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${freshStart === value ? 'bg-accent text-white ring-accent' : 'text-steel-200 ring-line/[0.12] hover:bg-line/[0.06]'}`}
                  onClick={() => { startedFor.current = null; setFreshStart(value); }}>
                  {label}
                </button>
              ))}
              <p className="w-full text-xs text-steel-400">
                {freshStart
                  ? 'A new task, apart from the enquiry — pick any model on the register.'
                  : <>Filled from <span className="font-semibold text-steel-200">{loaded.from.enquiry.number}</span>, this buyer’s latest enquiry — change anything that differs.</>}
              </p>
            </div>
          )}

          {prefill && (button.asks || []).map((field) => {
            const heading = field.section && field.section !== section ? field.section : null;
            if (field.section) section = field.section;
            const value = answers[field.key] ?? '';
            return (
              <div key={field.key} className="contents">
                {heading && <p className="pt-1 text-sm font-bold text-steel-100 sm:col-span-2">{heading}</p>}
                {field.type === 'items' && <Rows field={field} rows={answers[field.key] || []} prefill={prefill} onChange={answer(field.key)} />}
                {field.type === 'info' && (
                  <div className="rounded-xl border border-accent/30 bg-accent/[0.05] px-3 py-2 sm:col-span-2">
                    <p className="text-sm font-bold text-steel-100">{field.label}</p>
                    <p className="text-xs text-steel-300">{prefillValue(prefill, field.from) || 'Not on the customer yet'}</p>
                  </div>
                )}
                {field.type === 'kind' && (
                  <Field label={field.label}>
                    <select className="input" value={kind} onChange={(event) => setKind(event.target.value)}>
                      {field.options.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
                    </select>
                  </Field>
                )}
                {field.type === 'check' && (
                  <div className="flex items-end sm:col-span-2">
                    <Answer field={field} value={answers[field.key]} prefill={prefill} onChange={answer(field.key)} />
                  </div>
                )}
                {!['items', 'info', 'kind', 'check'].includes(field.type) && (
                  <Field label={field.label} required={field.required} hint={field.required && !value ? 'Needed to send' : undefined}>
                    <Answer field={field} value={value} prefill={prefill} onChange={answer(field.key)} />
                  </Field>
                )}
              </div>
            );
          })}

          {asksEdd && (
            <Field
              label="EDD — the date the buyer is promised"
              required
              hint={prefill?.edd
                ? 'The enquiry’s EDD — change it here if the buyer agreed another day'
                : 'Needed: Production, Printing, Assembly and Dispatch queue the work by it'}
              error={eddMissing && prefill ? 'Set the EDD to send this task' : undefined}
            >
              <input type="date" className="input" aria-label="EDD" min={todayInIndia()} value={edd} onChange={(event) => setEdd(event.target.value)} required />
            </Field>
          )}
          <Field label="Attach PDF" hint="Optional, 1 MB at most" className="sm:col-span-2" error={tooBig ? 'That PDF is over 1 MB' : notPdf ? 'Attach a PDF' : undefined}>
            <input type="file" accept="application/pdf" className="input" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </Field>
          {orders.length > 1 && (
            <Field label="For sales order" hint="The enquiry has more than one open SO — say which this is for" required>
              <select className="input" value={order} onChange={(event) => setOrder(event.target.value)} required>
                <option value="">Pick the SO…</option>
                {orders.map((row) => <option key={row._id} value={row._id}>{row.number}{row.customerPo?.number ? ` · PO ${row.customerPo.number}` : ''}</option>)}
              </select>
            </Field>
          )}
          {form.priority && (
            <Field label="Priority">
              <select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}>
                {PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          )}
          {form.requiredDate && (
            <Field label="Required date" hint="The task is due by the end of this day">
              <input type="date" className="input" min={todayInIndia()} value={requiredDate} onChange={(event) => setRequiredDate(event.target.value)} />
            </Field>
          )}
          <Field label={form.note?.label || 'Additional instruction / Question'} required={noteNeeded(button, answers) || Boolean(fromTask)} className="sm:col-span-2">
            <textarea rows={3} className="input" placeholder={form.note?.placeholder || ''} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>

        {/* Details changed from the enquiry: said, with the choice to change the enquiry too. Later forms start from these either way. */}
        {changes.length > 0 && (
          <div className="rounded-xl border border-accent/30 bg-accent/[0.05] p-3 text-sm" aria-label="Changed from the enquiry">
            <p className="font-semibold text-steel-100">Changed from the enquiry</p>
            <ul className="mt-1 space-y-0.5 text-xs text-steel-300">
              {changes.map((change) => (
                <li key={`${change.model}-${change.field}`}>
                  <span className="font-semibold text-steel-100">{change.model}</span> · {change.field}: {change.from ? <span className="line-through">{change.from}</span> : 'not set'} → <span className="font-semibold text-accent">{change.to}</span>
                </li>
              ))}
            </ul>
            <label className="mt-2 flex items-start gap-2 text-sm text-steel-200">
              <input type="checkbox" className="mt-0.5" checked={updateEnquiry} onChange={(event) => setUpdateEnquiry(event.target.checked)} />
              <span>Also update the enquiry with these changes <span className="block text-xs text-steel-400">Every later task starts from them either way; untick to keep the enquiry as the buyer first asked.</span></span>
            </label>
          </div>
        )}
        {missing && prefill && <p className="text-xs text-warn-400">Still needed: {missing}</p>}
        {mustExplain && <p className="text-xs text-warn-400">{fromTask ? 'Say what you need from them' : button.form.noteRequired.message}</p>}
        {problem && <Notice tone="danger">{problem}</Notice>}
        {duplicate && (
          <div className="rounded-xl border border-warn-500/50 bg-warn-500/[0.08] p-3" role="alert" aria-label="Already asked">
            <p className="text-sm font-bold text-warn-400">Already asked — {duplicate.number || 'an open job'}</p>
            <p className="mt-1 text-xs text-steel-200">{duplicate.words}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => { onClose(); navigate(`/team-jobs/${duplicate._id}`); }}>Open {duplicate.number || 'that job'}</button>
              <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => submit(null, { anyway: true })}>Raise another anyway</button>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || blocked}>
            {busy ? 'Sending…' : running ? 'Stop production & send' : form.submit || 'Assign to Team'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
