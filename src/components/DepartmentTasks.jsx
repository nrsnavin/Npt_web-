import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import HandoffTaskList from './HandoffTaskList.jsx';
import { Section } from './ui.jsx';
import { departmentLabel } from '../utils/pipeline.js';

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

  if (!tasks.length) return null;

  return (
    <div className="mx-auto mb-5 max-w-6xl">
      <Section
        title={`Tasks for ${departmentLabel(user?.department)} (${tasks.length})`}
        actions={<Link to="/departments/mine" className="text-xs font-semibold text-accent hover:underline">Department dashboard</Link>}
      >
        <HandoffTaskList tasks={tasks} onChanged={load} />
      </Section>
    </div>
  );
}
