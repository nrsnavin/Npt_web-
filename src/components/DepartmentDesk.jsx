import { useCallback, useEffect, useState } from 'react';
import { handoffs as handoffsApi } from '../api/endpoints.js';
import TaskPdfLink from './TaskPdfLink.jsx';
import DepartmentTaskDialog from './DepartmentTaskDialog.jsx';
import { describeBrief } from '../utils/taskForm.js';
import { useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { useAuth } from '../context/AuthContext.jsx';
import HandoffTaskActions from './HandoffTaskActions.jsx';
import { Field, Modal, Notice, Section } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';

/**
 * The enquiry's departments, and the tasks raised on them — the plant's own screen
 * [server: config/enquiryStages.js, config/handoffs.js, services/handoff.service.js].
 *
 * The enquiry stays with its marketing person; Admin sees every one. Clicking a department
 * raises that department's task, due by the end of the day, with the answers to the questions
 * the task asks (Sampling: mould, material, colour, preferred or compulsory) — and that task is
 * what the department's dashboard shows. Several departments can have tasks at once. Below is
 * everything that happened — what was asked, updates, what was done.
 */

const BUTTON = 'rounded-lg border border-line/20 px-3 py-1.5 text-sm font-semibold text-steel-100 transition-colors hover:border-success-500/60 hover:text-success-400';

const STATE = (task) => {
  if (task.outcome?.result === 'returned') return { text: 'Sent back', tone: 'text-warn-400' };
  if (task.outcome?.result === 'moved') return { text: 'Moved on', tone: 'text-steel-400' };
  if (task.completed) return { text: 'Done', tone: 'text-success-400' };
  if (task.user) return { text: `With ${task.user.name}`, tone: 'text-steel-300' };
  return { text: 'Waiting to be picked up', tone: 'text-steel-400' };
};

/** The buttons that record rather than raise a task: Photos Sent, Task Closed. */
function SendDialog({ button, enquiry, onClose, onSent }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  if (!button) return null;

  const needsNote = button.key === 'task_closed';

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await handoffsApi.send({ id: enquiry._id, kind: button.key, note });
      onSent();
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
      title={button.heading || button.label}
      description={button.hint}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label={needsNote ? 'Why it is being closed' : 'Note'}
          required={needsNote}
        >
          <textarea rows={3} className="input" value={note} onChange={(event) => setNote(event.target.value)} autoFocus />
        </Field>
        {button.key === 'task_closed' && (
          <Notice tone="warn">Closing ends every task still open on this enquiry. Nothing more can be sent on it.</Notice>
        )}
        {problem && <Notice tone="danger">{problem}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || (needsNote && note.trim().length < 3)}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function DepartmentDesk({ enquiry, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const { user, worksIn } = useAuth();
  const [history, setHistory] = useState(null);
  const [problem, setProblem] = useState(null);
  const [sending, setSending] = useState(null);

  const load = useCallback(() => {
    handoffsApi.list(enquiry._id).then(setHistory).catch((failure) => setProblem(failure.message));
  }, [enquiry._id]);
  useEffect(load, [load]);

  const stage = history?.stage || enquiry.stage || 'enquiry';
  const closed = stage === 'closed';
  const tasks = history?.data || [];
  const mayAct = (task) => user?.role === 'admin'
    || worksIn(task.department)
    || String(task.user?._id || task.user || '') === String(user?.id || user?._id || '');

  const refresh = () => {
    load();
    onChanged?.();
  };

  if (!catalogue) return null;
  const stages = catalogue.stages.filter((item) => item.number);
  const holder = history?.holder || null;
  const mayMove = Boolean(history?.mayMove);
  const holderButton = holder && catalogue.buttons.find((item) => item.key === holder.kind);
  const holderName = holder
    ? `${departmentLabel(holder.department)}${holder.user?.name ? ` (${holder.user.name})` : ''}`
    : '';
  const holderLate = holder?.dueDate && new Date(holder.dueDate) < new Date();
  const drawn = catalogue.buttons.filter((button) => !button.hidden);
  /* Which departments have a task open right now — several can, at once. */
  const openTasks = tasks.filter((task) => !task.completed && !task.holds);
  const openFor = (department) => openTasks.filter((task) => task.department === department).length;

  return (
    <Section title="Departments">
      <div className="space-y-4">
        {/*
          * The departments, as the plant numbers them. Where the work is now is lit green; a
          * department with a task open says so. Clicking one opens its task form, filled from
          * the enquiry [components/DepartmentTaskDialog.jsx], and raises its task
          * [server: config/handoffs.js TILE_KIND] — for its marketing person, whoever has it and
          * Admin. The first is marketing's own: the enquiry is always theirs.
          */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stages.map((item) => {
            const here = item.key === stage;
            const open = openFor(item.department);
            const sends = !closed && mayMove && catalogue.buttons.find((button) => button.key === item.kind);
            const look = `flex min-h-[3.25rem] flex-col items-center justify-center rounded-xl border px-2 py-2 text-center text-xs leading-tight ${
              here
                ? 'border-success-500/60 bg-success-500/10 font-bold text-success-400'
                : open ? 'border-warn-500/50 text-steel-200' : 'border-line/[0.08] text-steel-400'
            }`;
            const inside = (
              <>
                <span>{item.number}. {item.label}</span>
                {open > 0 && <span className="mt-0.5 text-[0.65rem] font-semibold text-warn-400">{open === 1 ? 'Task open' : `${open} tasks open`}</span>}
              </>
            );
            if (!sends) {
              return <div key={item.key} aria-current={here ? 'step' : undefined} className={look}>{inside}</div>;
            }
            return (
              <button
                key={item.key}
                type="button"
                aria-current={here ? 'step' : undefined}
                title={`Raise a ${departmentLabel(item.department)} task`}
                onClick={() => setSending({ ...sends, heading: `${item.number}. ${item.label} — ${sends.label}` })}
                className={`${look} transition-colors hover:border-success-500/60 hover:text-success-400 focus-visible:border-success-500/60`}
              >
                {inside}
              </button>
            );
          })}
        </div>
        {closed && <Notice tone="info">This enquiry is closed.</Notice>}

        {/* Whose enquiry it is — its marketing person, wherever its work is. */}
        {!closed && holder && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-accent/30 bg-accent/[0.05] px-3 py-2 text-sm">
            <p className="text-steel-100">
              <span className="text-steel-400">Enquiry with </span>
              <span className="font-semibold">{holderName}</span>
              {holderButton && holderButton.department !== 'owner' && <span className="text-steel-400"> · {holderButton.label}</span>}
              {openTasks.length > 0 && <span className="text-steel-400"> · {openTasks.length} department task{openTasks.length === 1 ? '' : 's'} open</span>}
            </p>
            {holder.dueDate && (
              <span className={`text-xs ${holderLate ? 'text-danger-400' : 'text-steel-400'}`}>
                {holderLate ? `Follow-up late — was due ${formatDate(holder.dueDate)}` : `Follow-up ${formatDate(holder.dueDate)}`}
              </span>
            )}
          </div>
        )}

        {!closed && (
          <div className="space-y-2">
            <p className="text-xs text-steel-500">
              {mayMove
                ? 'Tap a department to raise its task, or use a button below.'
                : `This is ${holderName || 'its marketing person'}’s enquiry. They or Admin raise department tasks on it.`}
            </p>
            {mayMove && (
              <div className="flex flex-wrap gap-2">
                {drawn.map((button) => (
                  <button key={button.key} type="button" title={button.hint} onClick={() => setSending(button)} className={`${BUTTON} ${button.department ? '' : 'text-steel-300'}`}>
                    {button.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {problem && <Notice tone="danger">{problem}</Notice>}

        {tasks.length > 0 && (
          <ul className="divide-y divide-line/[0.06] rounded-lg border border-line/[0.06]">
            {tasks.map((task) => {
              const state = STATE(task);
              const overdue = !task.completed && task.dueDate && new Date(task.dueDate) < new Date();
              const button = catalogue.buttons.find((item) => item.key === task.kind);
              const fields = task.outcome?.fields ? Object.entries(task.outcome.fields) : [];
              return (
                <li key={task._id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-steel-100">
                      {button?.label || task.title}
                      <span className="font-normal text-steel-400">
                        {' → '}{departmentLabel(task.department)}
                      </span>
                    </p>
                    <span className={`text-xs ${state.tone}`}>{state.text}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-steel-500">
                    {task.createdBy?.name && `${task.createdBy.name}${task.fromDepartment ? ` (${departmentLabel(task.fromDepartment)})` : ''} · `}
                    {formatDate(task.createdAt)}
                    {task.dueDate && !task.completed && (
                      <span className={overdue ? 'text-danger-400' : ''}>{` · due ${formatDate(task.dueDate)}${overdue ? ' — late' : ''}`}</span>
                    )}
                  </p>
                  {describeBrief(button, task.brief).map((line) => (
                    <p key={line} className="mt-1 text-xs text-steel-200"><span className="text-steel-500">Asked: </span>{line}</p>
                  ))}
                  <TaskPdfLink file={task.attachment} className="mt-1" />
                  {task.notes && <p className="mt-1 text-xs text-steel-300">“{task.notes}”</p>}
                  {task.reschedules?.map((change, index) => (
                    <p key={index} className="mt-1 text-xs text-steel-400">
                      Date moved to {formatDate(change.to)} by {change.by?.name || 'someone'}: {change.reason}
                    </p>
                  ))}
                  {task.updates?.map((update) => (
                    <p key={`${update.at}-${update.note}`} className="mt-1 text-xs text-steel-300">
                      <span className="text-steel-500">Update · {update.by?.name || 'someone'} {formatDate(update.at)}: </span>
                      {update.note}
                    </p>
                  ))}
                  {task.outcome?.note && task.kind !== 'photos_sent' && task.kind !== 'task_closed' && (
                    <p className="mt-1 text-xs text-steel-200">
                      {{ returned: 'Sent back', moved: 'Moved on' }[task.outcome.result] || 'Done'} by {task.outcome.by?.name || 'someone'}: {task.outcome.note}
                      {task.outcome.next && ` → ${catalogue.buttons.find((item) => item.key === task.outcome.next)?.label || 'next step'}`}
                    </p>
                  )}
                  {fields.length > 0 && (
                    <p className="mt-0.5 text-xs text-steel-400">
                      {fields.map(([key, value]) => `${button?.records?.find((record) => record.key === key)?.label || key}: ${value}`).join(' · ')}
                    </p>
                  )}
                  {!task.completed && mayAct(task) && (
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      <HandoffTaskActions todo={task} onChanged={refresh} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {sending && (
        sending.department ? (
          <DepartmentTaskDialog enquiry={enquiry} catalogue={catalogue} kind={sending.key} onClose={() => setSending(null)} onSent={refresh} />
        ) : (
          <SendDialog button={sending} enquiry={enquiry} onClose={() => setSending(null)} onSent={refresh} />
        )
      )}
    </Section>
  );
}
