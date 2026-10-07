import { useCallback, useEffect, useState } from 'react';
import { handoffs as handoffsApi } from '../api/endpoints.js';
import { useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { useAuth } from '../context/AuthContext.jsx';
import HandoffTaskActions from './HandoffTaskActions.jsx';
import { Field, Modal, Notice, Section } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';

/**
 * The enquiry's twelve stages and the buttons that send work to a department — the plant's own
 * screen [server: config/enquiryStages.js, config/handoffs.js].
 *
 * A button puts a task on that department's queue, due by the end of the day; anyone there can
 * pick it up, do it, send it back or move the date, and whoever sent it gets it back. Below the
 * buttons is everything that has been asked about this enquiry and what came of it.
 */

const STATE = (task) => {
  if (task.outcome?.result === 'returned') return { text: 'Sent back', tone: 'text-warn-400' };
  if (task.completed) return { text: 'Done', tone: 'text-success-400' };
  if (task.user) return { text: `With ${task.user.name}`, tone: 'text-steel-300' };
  return { text: 'Waiting to be picked up', tone: 'text-steel-400' };
};

function SendDialog({ button, enquiry, onClose, onSent }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  if (!button) return null;

  const to = button.department === 'owner'
    ? (enquiry.assignedTo?.name || 'whoever holds the enquiry')
    : button.department ? departmentLabel(button.department) : null;
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
      title={button.label}
      description={to ? `Goes to ${to} — due by the end of today. ${button.hint || ''}` : button.hint}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label={needsNote ? 'Why it is being closed' : to ? `Anything ${to} should know` : 'Note'}
          required={needsNote}
          hint={to ? 'Sent to them on WhatsApp with the task' : undefined}
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
            {busy ? 'Sending…' : to ? `Send to ${to}` : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function DepartmentDesk({ enquiry, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const { user } = useAuth();
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
    || task.department === user?.department
    || String(task.user?._id || task.user || '') === String(user?.id || user?._id || '');

  const refresh = () => {
    load();
    onChanged?.();
  };

  if (!catalogue) return null;
  const stages = catalogue.stages.filter((item) => item.number);

  return (
    <Section title="Departments">
      <div className="space-y-4">
        {/* The twelve stages, as the plant numbers them. Where it is now is lit. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stages.map((item) => {
            const here = item.key === stage;
            return (
              <div
                key={item.key}
                aria-current={here ? 'step' : undefined}
                className={`flex min-h-[3.25rem] items-center justify-center rounded-xl border px-2 py-2 text-center text-xs leading-tight ${
                  here
                    ? 'border-success-500/60 bg-success-500/10 font-bold text-success-400'
                    : 'border-line/[0.08] text-steel-400'
                }`}
              >
                {item.number}. {item.label}
              </div>
            );
          })}
        </div>
        {closed && <Notice tone="info">This enquiry is closed.</Notice>}

        {/* The buttons. Each sends a task to a department; two only record. */}
        {!closed && (
          <div className="flex flex-wrap gap-2">
            {catalogue.buttons.map((button) => (
              <button
                key={button.key}
                type="button"
                title={button.hint}
                onClick={() => setSending(button)}
                className="rounded-lg border border-line/20 px-3 py-1.5 text-sm font-semibold text-steel-100 transition-colors hover:border-success-500/60 hover:text-success-400"
              >
                {button.label}
              </button>
            ))}
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
                  {task.notes && <p className="mt-1 text-xs text-steel-300">“{task.notes}”</p>}
                  {task.reschedules?.map((change, index) => (
                    <p key={index} className="mt-1 text-xs text-steel-400">
                      Date moved to {formatDate(change.to)} by {change.by?.name || 'someone'}: {change.reason}
                    </p>
                  ))}
                  {task.outcome?.note && task.kind !== 'photos_sent' && task.kind !== 'task_closed' && (
                    <p className="mt-1 text-xs text-steel-200">
                      {task.outcome.result === 'returned' ? 'Sent back' : 'Done'} by {task.outcome.by?.name || 'someone'}: {task.outcome.note}
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
        <SendDialog button={sending} enquiry={enquiry} onClose={() => setSending(null)} onSent={refresh} />
      )}
    </Section>
  );
}
