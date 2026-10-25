import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import HandoffTaskActions from './HandoffTaskActions.jsx';
import TaskWorkflow from './TaskWorkflow.jsx';
import TaskEdd from './TaskEdd.jsx';
import DeliveryUrgencyPrompt from './DeliveryUrgencyPrompt.jsx';
import { Modal, Notice } from './ui.jsx';
import { TaskFacts, TaskTimeline } from './TaskHistory.jsx';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { formatDate } from '../utils/format.js';
import { departmentLabel } from '../utils/pipeline.js';

/**
 * One department task, opened from the Department Tasks board: what was asked, every update so
 * far, and — for whoever works it [server: handoff.service `mayWorkOnHandoff`: Admin, the person
 * it is with, its department] — the status workflow and Update / Done / Send back / Change date.
 * Anyone else reads it. Admin works any department's task from here without going to that
 * department's desk; an update Admin writes leaves the task on the department's queue.
 */
export default function TaskPanel({ task, startWith, mayWork, onClose, onChanged }) {
  const { user, isManagement, departments = [] } = useAuth();
  const catalogue = useHandoffCatalogue();
  const button = buttonFor(catalogue, task.kind);
  const me = String(user?.id || user?._id || '');
  const holder = task.user?._id ? task.user : null;
  const enquiry = task.enquiry && typeof task.enquiry === 'object' ? task.enquiry : null;
  const late = !task.completed && task.dueDate && new Date(task.dueDate) < new Date();
  const claim = async () => {
    await workspace.todos.update({ id: task._id, claim: true });
    onChanged?.();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${task.label || button?.label || task.title}${task.customer?.name ? ` — ${task.customer.name}` : ''}`}
      description={`${departmentLabel(task.department)}${task.team ? ` · ${task.team}` : ''}${task.fromDepartment ? ` · asked by ${departmentLabel(task.fromDepartment)}` : ''}`}
      size="lg"
    >
      <div className="space-y-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-steel-500">Enquiry</dt>
            <dd className="text-steel-100">
              {enquiry ? <Link to={`/enquiries/${enquiry._id}`} className="text-accent hover:underline">{enquiry.number}</Link> : 'Team task — no enquiry'}
              {task.order?.number ? <span className="text-steel-400"> · {task.order.number}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-steel-500">Requested by</dt>
            <dd className="text-steel-100">{task.createdBy?.name || '—'}{task.createdAt ? ` · ${formatDate(task.createdAt)}` : ''}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel-500">With</dt>
            <dd className="text-steel-100">{holder ? (String(holder._id) === me ? 'you' : holder.name) : 'nobody has picked it up'}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel-500">{task.completed ? 'Done' : 'Due'}</dt>
            <dd className={task.completed ? 'text-success-400' : late ? 'font-semibold text-danger-400' : 'text-steel-100'}>
              {task.completed ? (task.completedAt ? formatDate(task.completedAt) : 'Done') : task.dueDate ? `${formatDate(task.dueDate)}${late ? ' — late' : ''}` : '—'}
            </dd>
          </div>
        </dl>

        {/* The EDD on the tasks that give it or work to it; asked for at the top until it is given. */}
        <TaskEdd todo={task} mayAct={mayWork} onChanged={onChanged} />
        {/* A Dispatch request: its delivery urgency, confirmed or changed by marketing or Admin — Dispatch reads it [server: deliveryUrgency.service]. */}
        <DeliveryUrgencyPrompt task={task} maySet={isManagement || (departments.includes('marketing') && !departments.includes(task.department))} onSaved={onChanged} />

        {/* The rule's proposal on a collection case — the collector or Admin presses Escalated to PRT, or not. */}
        {!task.completed && task.suggestion?.kind === 'escalate_prt' && (
          <Notice tone="warn">
            <p>
              <span className="font-bold">Escalate to PRT?</span> {task.suggestion.reason}
              {task.suggestion.at ? ` · noted ${formatDate(task.suggestion.at)}` : ''}.
              {mayWork ? ' Choose “Escalated to PRT” below to send it to the field, or any other step to keep it on the phone.' : ''}
            </p>
          </Notice>
        )}

        {(task.brief || task.attachment) && (
          <div className="rounded-xl border border-line/[0.08] p-3">
            <p className="mb-1 text-xs font-semibold text-steel-400">What was asked</p>
            <TaskFacts button={button} task={task} />
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-semibold text-steel-400">What happened</p>
          <TaskTimeline task={task} button={button} />
        </div>

        {mayWork && !task.completed ? (
          <div className="space-y-3 border-t border-line/[0.06] pt-3">
            <TaskWorkflow todo={task} startWith={startWith} onChanged={onChanged} />
            <div className="flex flex-wrap gap-3">
              {!holder && <button type="button" className="row-action" onClick={claim}>I’ll take it</button>}
              <HandoffTaskActions todo={task} onChanged={onChanged} />
            </div>
          </div>
        ) : !task.completed ? (
          <p className="text-xs text-steel-500">Read-only — this task is on the {departmentLabel(task.department)} queue.</p>
        ) : null}
      </div>
    </Modal>
  );
}
