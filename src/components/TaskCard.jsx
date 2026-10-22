import { useState } from 'react';
import TaskPdfLink from './TaskPdfLink.jsx';
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
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-line/[0.03]"
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
        <span aria-hidden className={`mt-1 text-xs text-steel-500 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

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
          {(task.brief || task.attachment) && (
            <div className="rounded-lg border border-line/[0.06] p-2.5">
              <p className="mb-1 text-xs font-semibold text-steel-400">What was asked</p>
              <TaskFacts button={button} task={task} />
              <TaskPdfLink file={task.attachment} className="mt-1" />
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
