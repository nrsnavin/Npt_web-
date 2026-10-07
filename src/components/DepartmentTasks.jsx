import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import HandoffTaskActions from './HandoffTaskActions.jsx';
import { Section } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';

/**
 * The tasks other departments have sent this one about an enquiry, at the top of Today — so a
 * department sees what it has been asked before its own screen [server: config/handoffs.js].
 * Both the department's queue (anyone may pick one up) and anything sent to this person by name.
 * Drawn only when there is something open.
 */
export default function DepartmentTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);

  const load = useCallback(() => {
    Promise.all([
      workspace.todos.list({ scope: 'department' }).catch(() => ({ data: [] })),
      workspace.todos.list({ scope: 'mine' }).catch(() => ({ data: [] })),
    ]).then(([department, mine]) => {
      const seen = new Map();
      for (const task of [...(department.data || []), ...(mine.data || [])]) {
        if (task.kind && !task.completed) seen.set(task._id, task);
      }
      setTasks([...seen.values()].sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0)));
    });
  }, []);
  useEffect(load, [load]);

  const claim = async (task) => {
    await workspace.todos.update({ id: task._id, claim: true });
    load();
  };

  if (!tasks.length) return null;
  const me = String(user?.id || user?._id || '');

  return (
    <div className="mx-auto mb-5 max-w-6xl">
      <Section title={`Tasks for ${departmentLabel(user?.department)} (${tasks.length})`}>
        <ul className="divide-y divide-line/[0.06]">
          {tasks.map((task) => {
            const late = task.dueDate && new Date(task.dueDate) < new Date();
            const holder = task.user?._id ? task.user : null;
            return (
              <li key={task._id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <Link to={task.link || '#'} className="text-sm font-semibold text-steel-100 hover:text-accent">
                    {task.title}
                  </Link>
                  <span className={`text-xs ${late ? 'text-danger-400' : 'text-warn-400'}`}>
                    {late ? `Late — was due ${formatDate(task.dueDate)}` : 'Due today'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-steel-400">
                  {[task.enquiry?.requirement?.modelNumber, task.enquiry?.requirement?.colour].filter(Boolean).join(' · ')}
                  {task.createdBy?.name && ` — from ${task.createdBy.name}${task.fromDepartment ? ` (${departmentLabel(task.fromDepartment)})` : ''}`}
                  {holder ? ` · with ${String(holder._id) === me ? 'you' : holder.name}` : ' · nobody has picked it up'}
                </p>
                {task.notes && <p className="mt-1 text-xs text-steel-300">“{task.notes}”</p>}
                <div className="mt-1.5 flex flex-wrap gap-3">
                  {!holder && (
                    <button type="button" className="row-action" onClick={() => claim(task)}>I&rsquo;ll take it</button>
                  )}
                  <HandoffTaskActions todo={task} onChanged={load} />
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
