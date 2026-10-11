import { useState } from 'react';
import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';
import TaskWorkflow from './TaskWorkflow.jsx';
import { Notice } from './ui.jsx';

/**
 * What needs this person now, highlighted at the top of their dashboard [server: handoff.service
 * `attentionFor`] — so a question or an answer is acted on where it is seen, not found by search.
 *
 *   Questions for you   a clarification another department asked (the SO team asking which
 *                       GSTIN) — answered right here; the answer goes back onto their task
 *   Replies             an answer that came back on one of this department's tasks — with the
 *                       task's status beside it, and "Got it"; it stays until somebody acts
 *   Updates on enquiries a department moved its task on one of your enquiries (Admin: any) —
 *                       Production to Planning, with its remark and ready date. Mark it read,
 *                       then dismiss it; a read one clears itself a day later anyway
 *                       [server: models/TaskNotice.js]
 */

function Question({ task, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const asking = task.parentTask ? buttonFor(catalogue, task.parentTask.kind) : null;
  const from = task.parentTask ? departmentLabel(task.parentTask.department) : departmentLabel(task.createdBy?.department);
  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await workspace.todos.done({ id: task._id, note: reply });
      onChanged();
    } catch (failure) {
      setProblem(failure.message);
      setBusy(false);
    }
  };
  return (
    <form onSubmit={send} className="rounded-xl border border-warn-500/40 bg-warn-500/[0.07] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-steel-50">
          {from} asks
          {asking && <span className="font-normal text-steel-400"> · {asking.label}</span>}
          {' · '}
          <Link to={`/enquiries/${task.enquiry?._id || task.enquiry}`} className="text-accent hover:underline">{task.enquiry?.number}</Link>
          {task.customer?.name && <span className="font-normal text-steel-300"> · {task.customer.name}</span>}
        </p>
        <span className="text-xs text-steel-400">{formatDate(task.createdAt)}</span>
      </div>
      <p className="mt-1 text-sm text-steel-100">“{task.notes}”</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          placeholder="Your answer — it goes back onto their task"
          aria-label={`Answer ${from}`}
          value={reply}
          onChange={(event) => setReply(event.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={busy || reply.trim().length < 2}>{busy ? 'Sending…' : 'Send reply'}</button>
      </div>
      {problem && <div className="mt-2"><Notice tone="danger">{problem}</Notice></div>}
    </form>
  );
}

function Reply({ task, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, task.kind);
  const [busy, setBusy] = useState(false);
  const gotIt = async () => {
    setBusy(true);
    try {
      await workspace.todos.seen(task._id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/[0.07] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-steel-50">
          {task.attention.by?.name || 'Marketing'} replied
          <span className="font-normal text-steel-400"> · {button?.label || task.title}</span>
          {' · '}
          <Link to={`/enquiries/${task.enquiry?._id || task.enquiry}`} className="text-accent hover:underline">{task.enquiry?.number}</Link>
          {task.customer?.name && <span className="font-normal text-steel-300"> · {task.customer.name}</span>}
        </p>
        <span className="text-xs text-steel-400">{formatDate(task.attention.at)}</span>
      </div>
      <p className="mt-1 text-sm text-steel-100">“{task.attention.note}”</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <TaskWorkflow todo={task} onChanged={onChanged} />
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={gotIt}>Got it</button>
      </div>
    </div>
  );
}

function Update({ notice, onChanged }) {
  const [busy, setBusy] = useState(false);
  const read = Boolean(notice.readAt);
  const act = (call) => async () => {
    setBusy(true);
    try {
      await call(notice._id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  /* Opening the enquiry is reading it. */
  const opened = () => { if (!read) workspace.notices.read(notice._id).catch(() => {}); };
  return (
    <div aria-label={`${notice.statusLabel} on ${notice.enquiry?.number || 'a team task'}`} className={`rounded-xl border p-3 ${read ? 'border-line/[0.1] bg-line/[0.02]' : 'border-accent/40 bg-accent/[0.07]'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`text-sm text-steel-50 ${read ? 'font-semibold' : 'font-bold'}`}>
          {!read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent align-middle" aria-label="Unread" />}
          {departmentLabel(notice.department)} · {notice.statusLabel}
          {' · '}
          {notice.enquiry ? (
            <Link to={`/enquiries/${notice.enquiry?._id || notice.enquiry}`} onClick={opened} className="text-accent hover:underline">{notice.enquiry?.number}</Link>
          ) : (
            <span className="font-normal text-steel-300">Team task</span>
          )}
          {notice.customer?.name && <span className="font-normal text-steel-300"> · {notice.customer.name}</span>}
        </p>
        <span className="text-xs text-steel-400">{notice.by?.name ? `${notice.by.name} · ` : ''}{formatDate(notice.at)}</span>
      </div>
      {notice.note && <p className="mt-1 text-sm text-steel-100">“{notice.note}”</p>}
      {notice.date && <p className="mt-1 text-xs font-semibold text-steel-200">Ready date {formatDate(notice.date)}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {read ? (
          <>
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={act(workspace.notices.dismiss)}>Dismiss</button>
            <span className="text-xs text-steel-500">Read · clears itself a day after reading</span>
          </>
        ) : (
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={act(workspace.notices.read)}>Mark as read</button>
        )}
      </div>
    </div>
  );
}

export default function AttentionPanel({ attention, onChanged }) {
  const questions = attention?.questions || [];
  const replies = attention?.replies || [];
  const notices = attention?.notices || [];
  const unread = notices.filter((notice) => !notice.readAt).length;
  if (!questions.length && !replies.length && !notices.length) return null;
  return (
    <section aria-label="Needs your action" className="card space-y-3 border-warn-500/40 p-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-steel-50">
        <span className="h-2.5 w-2.5 rounded-full bg-warn-400" aria-hidden="true" />
        Needs your action
        <span className="rounded-full bg-warn-500/15 px-2 text-xs font-semibold tabular-nums text-warn-400">{questions.length + replies.length + unread}</span>
      </h2>
      {questions.length > 0 && (
        <div className="space-y-2">
          <p className="eyebrow">Questions for you</p>
          {questions.map((task) => <Question key={task._id} task={task} onChanged={onChanged} />)}
        </div>
      )}
      {replies.length > 0 && (
        <div className="space-y-2">
          <p className="eyebrow">Replies to your department</p>
          {replies.map((task) => <Reply key={task._id} task={task} onChanged={onChanged} />)}
        </div>
      )}
      {notices.length > 0 && (
        <div className="space-y-2">
          <p className="eyebrow">Updates on your enquiries</p>
          {notices.map((notice) => <Update key={notice._id} notice={notice} onChanged={onChanged} />)}
        </div>
      )}
    </section>
  );
}
