import { useEffect, useMemo, useState } from 'react';
import { handoffs as handoffsApi, workspace } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Field, Modal, Notice } from './ui.jsx';
import {
  briefToSend, departmentOptions, missingAnswer, noteNeeded, optionOf, optionsOf, prefillValue, startingAnswers, todayInIndia,
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
 */

const PDF_LIMIT = 1024 * 1024;
const PRIORITIES = [['normal', 'Normal'], ['high', 'High'], ['low', 'Low']];

function Answer({ field, value, prefill, onChange }) {
  const options = optionsOf(field, prefill);
  if (field.type === 'choice') {
    return (
      <select className="input" value={value || ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">{field.placeholder || 'Choose…'}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
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
      min={field.type === 'number' ? 0 : undefined}
      className="input"
      placeholder={field.placeholder || ''}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A table of rows — a sample's models, each with its parts, colour rule and pieces. */
function Rows({ field, rows, onChange }) {
  const set = (index, key, value) => onChange(rows.map((row, at) => (at === index ? { ...row, [key]: value } : row)));
  const blank = Object.fromEntries(field.columns.map((column) => [column.key, column.key === 'quantity' ? '3' : '']));
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
            <label key={column.key} className={`text-[0.7rem] text-steel-500 ${column.key === 'model' ? 'col-span-2' : ''}`}>
              {column.label}{column.required ? ' *' : ''}
              <Answer field={column} value={row[column.key]} onChange={(value) => set(index, column.key, value)} />
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

export default function DepartmentTaskDialog({ enquiry, catalogue, kind: startKind, fromTask, title, onClose, onSent }) {
  const [kind, setKind] = useState(startKind);
  const [prefill, setPrefill] = useState(null);
  const [answers, setAnswers] = useState({});
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('normal');
  const [requiredDate, setRequiredDate] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const { toast, warn } = useToast();

  const buttons = catalogue?.buttons || [];
  const button = buttons.find((entry) => entry.key === kind);
  const form = button?.form || {};
  const choices = useMemo(() => departmentOptions(buttons), [buttons]);

  useEffect(() => {
    let live = true;
    handoffsApi.prefill(enquiry._id)
      .then((data) => { if (live) setPrefill(data || {}); })
      .catch(() => { if (live) setPrefill({}); });
    return () => { live = false; };
  }, [enquiry._id]);

  /* A new department, or the enquiry's answers arriving: the form starts again from the enquiry. */
  useEffect(() => {
    if (!button || !prefill) return;
    setAnswers(startingAnswers(button, prefill));
    setRequiredDate(button.key === 'invoice_dispatch' ? todayInIndia() : '');
  }, [button, prefill]);

  if (!button) return null;

  /* A list entry is a button's own key (two that share one entry share the first's). */
  const pickDepartment = (value) => setKind(value);
  const answer = (key) => (value) => setAnswers((current) => ({ ...current, [key]: value }));
  const missing = missingAnswer(button, answers);
  const mustExplain = (noteNeeded(button, answers) || Boolean(fromTask)) && note.trim().length < 3;
  const tooBig = file && file.size > PDF_LIMIT;
  const notPdf = file && file.type !== 'application/pdf';
  const blocked = !prefill || Boolean(missing) || mustExplain || tooBig || notPdf;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      /* A department that already has this task open gets the request added to it. */
      const payload = {
        kind, note, brief: briefToSend(button, answers),
        ...(form.priority ? { priority } : {}),
        ...(requiredDate ? { requiredDate } : {}),
      };
      const sent = fromTask
        ? await workspace.todos.ask({ id: fromTask._id, ...payload }).then((answer) => ({ task: answer.raised, addedTo: answer.addedTo }))
        : await handoffsApi.send({ id: enquiry._id, addToOpen: true, ...payload });
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
          await handoffsApi.attach({ id: enquiry._id, taskId: sent.task._id, file });
        } catch (failure) {
          onSent();
          setProblem(`The task was sent, but the PDF did not attach: ${failure.message}`);
          setBusy(false);
          return;
        }
      }
      onSent();
      onClose();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  let section = null;
  return (
    <Modal open title={title || form.title || 'Assign department task'} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer / Company">
            <input className="input" value={enquiry.customer?.name || prefill?.customer?.name || ''} readOnly />
          </Field>
          <Field label="Workflow / Department">
            <select className="input" value={optionOf(button)} disabled={Boolean(fromTask)} onChange={(event) => pickDepartment(event.target.value)}>
              {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
          </Field>

          {!prefill && <p className="text-sm text-steel-400 sm:col-span-2">Filling the form from the enquiry…</p>}

          {prefill && (button.asks || []).map((field) => {
            const heading = field.section && field.section !== section ? field.section : null;
            if (field.section) section = field.section;
            const value = answers[field.key] ?? '';
            return (
              <div key={field.key} className="contents">
                {heading && <p className="pt-1 text-sm font-bold text-steel-100 sm:col-span-2">{heading}</p>}
                {field.type === 'items' && <Rows field={field} rows={answers[field.key] || []} onChange={answer(field.key)} />}
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

          <Field label="Attach PDF" hint="Optional, 1 MB at most" className="sm:col-span-2" error={tooBig ? 'That PDF is over 1 MB' : notPdf ? 'Attach a PDF' : undefined}>
            <input type="file" accept="application/pdf" className="input" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </Field>
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

        {missing && prefill && <p className="text-xs text-warn-400">Still needed: {missing}</p>}
        {mustExplain && <p className="text-xs text-warn-400">{fromTask ? 'Say what you need from them' : button.form.noteRequired.message}</p>}
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || blocked}>
            {busy ? 'Sending…' : form.submit || 'Assign to Team'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
