import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import HandoffTaskActions from './HandoffTaskActions.jsx';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';

/**
 * A list of department tasks about enquiries [server: config/handoffs.js], as Today and the
 * department dashboard draw them: what, about which enquiry, from whom, due when, who has it —
 * and, where this person may act on it, take it / update / move on / send back / change date.
 *
 * `perspective` is whose list it is: `holder` (the department doing the work) or `sender`
 * (what this department is waiting on, or what came back).
 */
function stateOf(task) {
  if (task.outcome?.result === 'returned') return { text: 'Sent back', tone: 'text-warn-400' };
  if (task.outcome?.result === 'moved') return { text: 'Moved on', tone: 'text-steel-400' };
  if (task.completed) return { text: 'Done', tone: 'text-success-400' };
  if (task.dueDate && new Date(task.dueDate) < new Date()) {
    return { text: `Late — was due ${formatDate(task.dueDate)}`, tone: 'text-danger-400' };
  }
  return { text: `Due ${formatDate(task.dueDate)}`, tone: 'text-warn-400' };
}

const OUTCOME_WORDS = { returned: 'Sent back', moved: 'Moved on', done: 'Done' };

export default function HandoffTaskList({ tasks, onChanged, perspective = 'holder', empty }) {
  const { user } = useAuth();
  const catalogue = useHandoffCatalogue();
  const me = String(user?.id || user?._id || '');
  const mayAct = (task) => user?.role === 'admin'
    || task.department === user?.department
    || String(task.user?._id || task.user || '') === me;

  const claim = async (task) => {
    await workspace.todos.update({ id: task._id, claim: true });
    onChanged?.();
  };

  if (!tasks?.length) return empty ? <p className="text-sm text-steel-500">{empty}</p> : null;

  return (
    <ul className="divide-y divide-line/[0.06]">
      {tasks.map((task) => {
        const state = stateOf(task);
        const holder = task.user?._id ? task.user : null;
        const enquiry = task.enquiry && typeof task.enquiry === 'object' ? task.enquiry : null;
        return (
          <li key={task._id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <Link to={task.link || '#'} className="text-sm font-semibold text-steel-100 hover:text-accent">
                {task.title}
              </Link>
              <span className={`text-xs ${state.tone}`}>{state.text}</span>
            </div>
            <p className="mt-0.5 text-xs text-steel-400">
              {[enquiry?.requirement?.modelNumber, enquiry?.requirement?.colour].filter(Boolean).join(' · ')}
              {perspective === 'sender'
                ? ` — with ${departmentLabel(task.department)}${holder ? ` (${holder.name})` : ''}`
                : `${task.createdBy?.name ? ` — from ${task.createdBy.name}${task.fromDepartment ? ` (${departmentLabel(task.fromDepartment)})` : ''}` : ''}`}
              {!task.completed && perspective === 'holder' && (holder ? ` · with ${String(holder._id) === me ? 'you' : holder.name}` : ' · nobody has picked it up')}
            </p>
            {task.notes && <p className="mt-1 text-xs text-steel-300">“{task.notes}”</p>}
            {/* The last few updates, newest last — how it is going while it is still here. */}
            {(task.updates || []).slice(-2).map((update) => (
              <p key={`${update.at}-${update.note}`} className="mt-1 text-xs text-steel-300">
                <span className="text-steel-500">Update{update.by?.name ? ` · ${update.by.name}` : ''} {formatDate(update.at)}: </span>
                {update.note}
              </p>
            ))}
            {task.outcome?.note && (
              <p className="mt-1 text-xs text-steel-200">
                {OUTCOME_WORDS[task.outcome.result] || 'Done'}
                {task.outcome.by?.name ? ` by ${task.outcome.by.name}` : ''}: {task.outcome.note}
                {task.outcome.next && ` → ${buttonFor(catalogue, task.outcome.next)?.label || 'next step'}`}
              </p>
            )}
            {!task.completed && mayAct(task) && (
              <div className="mt-1.5 flex flex-wrap gap-3">
                {!holder && (
                  <button type="button" className="row-action" onClick={() => claim(task)}>I&rsquo;ll take it</button>
                )}
                <HandoffTaskActions todo={task} onChanged={onChanged} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
