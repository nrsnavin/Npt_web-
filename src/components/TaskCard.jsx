import { useRef, useState } from 'react';
import { files as filesApi, quotations as quotationsApi, workspace } from '../api/endpoints.js';
import TaskWorkflow from './TaskWorkflow.jsx';
import TaskStepper from './TaskStepper.jsx';
import HandoffTaskActions from './HandoffTaskActions.jsx';
import { CHIP, TaskFacts, TaskTimeline } from './TaskHistory.jsx';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { timelineOf } from '../utils/taskHistory.js';
import { latestOf, stateOf, whenOf } from '../utils/taskState.js';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate, formatRelative, initialsOf } from '../utils/format.js';
import TaskEdd from './TaskEdd.jsx';
import { EDD_CHIP, eddChipOf } from '../utils/edd.js';
import TaskPdfLink from './TaskPdfLink.jsx';

/**
 * One department task on the enquiry, read in a glance and opened for the rest
 * [components/DepartmentDesk.jsx]:
 *
 *   closed   who has it · what it is · the step it is at, coloured by what that means · the
 *            latest thing anybody wrote on it · the date that matters (ready, due, done) · how
 *            far along its department's ladder it is
 *   open     what was asked · who raised it and when · everything that happened, as a
 *            conversation · the workflow with its next step as the one big button · "⋯" for
 *            update / done / send back / change date, for whoever may work it
 *
 * A finished task keeps to its one line until it is opened.
 */
/** A blob the session can read, handed to a new tab — the file routes need the token. */
const openBlob = async (load) => {
  const url = URL.createObjectURL(await load());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/**
 * A finished sample task, at a glance: how the sample went — the courier, AWB, pieces and day — or
 * who received it, with the hand-over photo; and the courier copy, opened from here or uploaded by
 * whoever works the task [server: handoff.controller `withRecords`].
 */
function SampleSent({ task, mayAct, onChanged }) {
  const sample = task.sample;
  const picker = useRef(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  if (!sample) return null;
  const given = sample.collection || {};
  const copy = (task.documents || []).find((paper) => paper.docType === 'courier_copy');
  const photo = given.photo?.key ? given.photo : null;
  const couriered = sample.deliveryMethod === 'courier' || (sample.courier && sample.deliveryMethod !== 'direct');
  const received = given.collectedAt || sample.deliveryMethod === 'direct';
  if (!couriered && !received) return null;
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { setProblem('Over 1 MB — take a smaller photo'); return; }
    setBusy(true);
    setProblem(null);
    try {
      await workspace.todos.addDocument({ id: task._id, docType: 'courier_copy', file });
      onChanged?.();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2.5 pl-14 text-xs" aria-label={`How ${sample.number} reached the buyer`}>
      {couriered ? (
        <span className="text-steel-300">
          <span className="font-semibold text-steel-100">{sample.courier || 'Courier'}</span>
          {sample.awbNumber && <> · AWB <span className="font-semibold text-steel-100">{sample.awbNumber}</span></>}
          {sample.dispatchedQuantity ? ` · ${sample.dispatchedQuantity} pcs` : ''}
          {sample.dispatchedAt ? ` · sent ${formatDate(sample.dispatchedAt)}` : ''}
        </span>
      ) : (
        <span className="text-steel-300">
          Received by <span className="font-semibold text-steel-100">{given.collectorName || sample.handedTo || '—'}</span>
          {(given.collectorPhone || sample.recipientPhone) ? ` · ${given.collectorPhone || sample.recipientPhone}` : ''}
          {given.pieces || sample.dispatchedQuantity ? ` · ${given.pieces || sample.dispatchedQuantity} pcs` : ''}
          {given.collectedAt || sample.dispatchedAt ? ` · ${formatDate(given.collectedAt || sample.dispatchedAt)}` : ''}
        </span>
      )}
      {photo && <button type="button" className="font-semibold text-accent hover:underline" onClick={() => openBlob(() => filesApi.blob(photo.key))}>Hand-over photo</button>}
      {couriered && (copy ? (
        <button type="button" className="font-semibold text-accent hover:underline" onClick={() => openBlob(() => filesApi.blob(copy.key))}>Courier copy</button>
      ) : mayAct ? (
        <>
          <button type="button" className="link-muted text-xs" disabled={busy} onClick={() => picker.current?.click()}>{busy ? 'Uploading…' : 'Upload courier copy'}</button>
          <input ref={picker} type="file" accept="application/pdf,image/jpeg,image/png" capture="environment" className="hidden" aria-label="Choose the courier copy" onChange={upload} />
        </>
      ) : <span className="text-steel-500">No courier copy</span>)}
      {problem && <span className="text-danger-400">{problem}</span>}
    </div>
  );
}

const EDGE = {
  progress: 'border-line/[0.08]',
  blocked: 'border-danger-500/40',
  done: 'border-line/[0.06]',
  waiting: 'border-line/[0.08]',
};

export default function TaskCard({ task, mayAct = false, open: openAtFirst = false, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, task.kind);
  const [open, setOpen] = useState(openAtFirst);
  const labelOf = (kind) => buttonFor(catalogue, kind)?.label || 'next step';
  const entries = timelineOf(task, button, { labelOf });
  const latest = latestOf(entries);
  const state = stateOf(task, button);
  const when = whenOf(task);
  const who = task.completed ? task.completedBy || task.outcome?.by : task.user;
  const hasWorkflow = Boolean(button?.form?.statuses?.length);
  const overdue = !task.completed && task.dueDate && new Date(task.dueDate) < new Date();
  const bodyId = `task-${task._id}-body`;
  /* The EDD, on the tasks that give it or work to it — or that it is still wanted. */
  const edd = eddChipOf(task);

  return (
    <li className={`rounded-xl border bg-ink-850 ${EDGE[state.tone]} ${task.completed ? 'opacity-80' : ''}`}>
      <div className="flex items-start">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-xl py-2.5 pl-3 pr-2 text-left transition-colors hover:bg-line/[0.03]"
        >
          <span
            aria-hidden
            title={who?.name}
            className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${who?.name ? 'bg-line/[0.1] text-steel-200' : 'border border-dashed border-line/30 text-steel-500'}`}
          >
            {who?.name ? initialsOf(who.name) : '?'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-steel-100">{button?.label || task.title}</span>
              <span className="text-xs text-steel-400">
                {departmentLabel(task.department)}
                {who?.name ? ` · ${who.name}` : task.completed ? '' : ' · not picked up'}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[state.tone]}`}>{state.label}</span>
              {edd && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${EDD_CHIP[edd.tone]}`}>{edd.label}</span>}
              {/* Nothing left to do on it [server: taskClosable.service] — the workflow below offers to close it. */}
              {!task.completed && task.closable?.why && (
                <span className="rounded-full bg-success-500/15 px-2 py-0.5 text-xs font-semibold text-success-400" title={task.closable.why}>Can be closed</span>
              )}
              {/* With Admin: escalated and not yet answered [HandoffTaskActions]. */}
              {task.adminEscalation?.at && !task.adminEscalation.resolvedAt && !task.completed && (
                <span className="rounded-full bg-danger-500/15 px-2 py-0.5 text-xs font-semibold text-danger-400" title={task.adminEscalation.reason}>With Admin</span>
              )}
            </span>
            {latest && (
              <span className="mt-0.5 block truncate text-sm text-steel-300">
                {latest.text || latest.statusLabel}
                <span className="text-xs text-steel-500">{` · ${latest.by?.name || 'Someone'}, ${formatRelative(latest.at)}`}</span>
              </span>
            )}
          </span>
          {when && (
            <span className={`hidden shrink-0 rounded-lg border px-2 py-1 text-right sm:block ${when.late ? 'border-danger-500/40 text-danger-400' : 'border-line/[0.08] text-steel-300'}`}>
              <span className="block text-xs">{when.late ? 'Late' : when.label}</span>
              <span className="block text-sm font-bold leading-tight">{formatDate(when.date)}</span>
            </span>
          )}
        </button>
        {/* The quotation the task answered, opened as its PDF beside the arrow [server: handoff.controller `withRecords`]. */}
        {task.quotation?._id && (task.completed || task.quotation.sentAt) && (
          <button
            type="button"
            className="btn-secondary mt-2.5 shrink-0 px-2.5 py-1 text-xs"
            title={`Open ${task.quotation.number} as a PDF`}
            onClick={() => openBlob(() => quotationsApi.pdf(task.quotation._id))}
          >
            Quote PDF
          </button>
        )}
        <button
          type="button"
          aria-label={open ? 'Hide the task' : 'Show the task'}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
          className="shrink-0 rounded-lg px-3 py-3 text-xs text-steel-500 hover:text-steel-200"
        >
          <span aria-hidden className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        </button>
      </div>
      {/* The PDF sent with the task, right under what was asked — open or folded, on every task. */}
      {task.attachment?.key && (
        <p className="-mt-1.5 pb-2 pl-14 pr-3 text-xs">
          <TaskPdfLink file={task.attachment} />
        </p>
      )}
      {task.completed && <SampleSent task={task} mayAct={mayAct} onChanged={onChanged} />}

      {(!task.completed || open) && <TaskStepper button={button} task={task} className="px-3 pb-2.5" />}

      {open && (
        <div id={bodyId} className="space-y-3 border-t border-line/[0.06] px-3 py-3">
          <p className="text-xs text-steel-500">
            {task.createdBy?.name && <>Raised by <span className="text-steel-300">{task.createdBy.name}</span>{task.fromDepartment ? ` (${departmentLabel(task.fromDepartment)})` : ''} · </>}
            {formatDate(task.createdAt)}
            {task.dueDate && !task.completed && (
              <span className={overdue ? 'font-semibold text-danger-400' : ''}>{` · due ${formatDate(task.dueDate)}${overdue ? ' — late' : ''}`}</span>
            )}
            {when && <span className="sm:hidden">{` · ${when.late ? 'late' : when.label.toLowerCase()} ${formatDate(when.date)}`}</span>}
          </p>
          <TaskEdd todo={task} mayAct={mayAct} onChanged={onChanged} />
          {task.brief && (
            <div className="rounded-lg border border-line/[0.06] p-2.5">
              <p className="mb-1 text-xs font-semibold text-steel-400">What was asked</p>
              <TaskFacts button={button} task={task} withPdf={false} />
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-steel-400">What happened</p>
            <TaskTimeline task={task} button={button} />
          </div>
          {hasWorkflow && (mayAct || task.completed) && (
            <div className="border-t border-line/[0.06] pt-3"><TaskWorkflow todo={task} onChanged={onChanged} /></div>
          )}
          {!task.completed && mayAct && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line/[0.06] pt-2">
              <HandoffTaskActions todo={task} onChanged={onChanged} layout="menu" primary={hasWorkflow ? undefined : 'done'} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
