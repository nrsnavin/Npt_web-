import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { overview } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import TaskWorkflow from './TaskWorkflow.jsx';
import DepartmentTaskDialog from './DepartmentTaskDialog.jsx';
import { ErrorState, Modal, TableSkeleton } from './ui.jsx';
import { formatDate, humanise } from '../utils/format.js';
import { departmentLabel } from '../utils/pipeline.js';

/**
 * Department Tasks [the plant's own layout]: every open request this person follows — Admin all
 * of them, a marketing person those on their own customers and the ones they raised, a department
 * its own queue [server: overview.service `trackedTasks`].
 *
 * One row a task: Customer / Model · Requested by / Assigned to · Status reply · Due. The status
 * is a list for whoever works the task (its department, or Admin) — picking a step opens the
 * move with its remark and date [components/TaskWorkflow.jsx]; anyone else reads it. A late or
 * urgent task is highlighted, and "Highlighted" shows just those.
 */

const DAY = 24 * 60 * 60 * 1000;

const isLate = (task) => Boolean(task.dueDate && new Date(task.dueDate).getTime() < Date.now());
export const isHighlighted = (task) => isLate(task) || ['high', 'urgent'].includes(task.priority);
const isFresh = (task) => Date.now() - new Date(task.createdAt).getTime() < DAY;

const modelOf = (task) =>
  task.enquiry?.requirement?.modelNumber || task.enquiry?.items?.find((item) => item.modelNumber)?.modelNumber || null;

function StatusReply({ task, statuses, mayWork, onPick }) {
  const current = statuses.find((entry) => entry.key === task.status);
  if (!statuses.length || !mayWork) {
    return <span className="text-sm text-steel-200">{current?.label || humanise(task.status) || 'Open'}</span>;
  }
  return (
    <select
      aria-label={`Status of ${task.label}`}
      className="input w-full min-w-[11rem] py-1.5 text-sm"
      value={task.status || ''}
      onChange={(event) => onPick(event.target.value)}
    >
      {!current && <option value="">{humanise(task.status) || 'Open'}</option>}
      {statuses.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
    </select>
  );
}

export default function DepartmentTasksBoard({ title = 'Department Tasks', subtitle = 'Follow the progress of requests for your customers.' }) {
  const { isAdmin, departments = [] } = useAuth();
  const fetch = useCallback(() => overview.tasks(), []);
  const { data, loading, error, reload } = useRecord(fetch, 'overview-tasks');
  const catalogue = useHandoffCatalogue();
  const [chip, setChip] = useState('all');
  const [search, setSearch] = useState('');
  const [moving, setMoving] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const firstTask = (catalogue?.buttons || []).find((button) => button.department && !button.hidden && button.form)?.key;
  const mayAssign = isAdmin || departments.includes('marketing');

  const tasks = useMemo(() => data || [], [data]);
  const teams = useMemo(() => [...new Set(tasks.map((task) => task.department).filter(Boolean))], [tasks]);
  const chips = [
    { key: 'all', label: 'All', count: tasks.length },
    { key: 'new', label: 'New', count: tasks.filter(isFresh).length },
    { key: 'highlighted', label: 'Highlighted', count: tasks.filter(isHighlighted).length },
    ...teams.map((team) => ({ key: team, label: departmentLabel(team), count: tasks.filter((task) => task.department === team).length })),
  ];
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (chip === 'new' && !isFresh(task)) return false;
      if (chip === 'highlighted' && !isHighlighted(task)) return false;
      if (!['all', 'new', 'highlighted'].includes(chip) && task.department !== chip) return false;
      if (!term) return true;
      return [task.customer?.name, task.enquiry?.number, modelOf(task), task.label, task.createdBy?.name, task.user?.name]
        .filter(Boolean).some((text) => text.toLowerCase().includes(term));
    });
  }, [tasks, chip, search]);

  const mayWork = (task) => isAdmin || departments.includes(task.department);
  const statusesOf = (task) => buttonFor(catalogue, task.kind)?.form?.statuses || [];

  return (
    <section className="card space-y-4 p-4 sm:p-5" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-steel-50">{title}</h2>
          <p className="text-sm text-steel-400">{subtitle}</p>
        </div>
        {mayAssign && firstTask && (
          <button type="button" className="btn-primary" onClick={() => setAssigning(true)}>+ Assign Task</button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={chip === entry.key}
            onClick={() => setChip(entry.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              chip === entry.key ? 'border-flame-500 bg-flame-500 text-white' : 'border-line/[0.12] text-steel-300 hover:border-line/25'
            }`}
          >
            {entry.label} <span className="tabular-nums opacity-75">{entry.count}</span>
          </button>
        ))}
        <input
          type="search"
          className="input ml-auto w-full sm:w-60"
          placeholder="Search customer, model or person…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading && !data ? (
        <TableSkeleton rows={4} columns={4} />
      ) : shown.length ? (
        <>
          {/* A table on a wide screen… */}
          <div className="hidden overflow-x-auto rounded-xl border border-line/10 md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-line/[0.03] text-xs font-semibold text-steel-400">
                <tr>
                  <th className="px-4 py-2.5">Customer / Model</th>
                  <th className="px-4 py-2.5">Requested by / Assigned to</th>
                  <th className="px-4 py-2.5">Status reply</th>
                  <th className="px-4 py-2.5">Due</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((task) => (
                  <tr key={task._id} data-highlighted={isHighlighted(task) || undefined} className={`border-t border-line/10 align-top ${isHighlighted(task) ? 'bg-warn-500/[0.08]' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-steel-50">{task.customer?.name || task.label}</p>
                      <p className="text-xs text-steel-400">
                        {task.label}
                        {modelOf(task) ? ` · ${modelOf(task)}` : ''}
                        {task.enquiry?.number && <> · <Link className="text-flame-500 hover:underline" to={`/enquiries/${task.enquiry._id}`}>{task.enquiry.number}</Link></>}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-steel-100">{task.createdBy?.name || '—'}</p>
                      <p className="text-xs text-steel-400">{task.user?.name || task.team || departmentLabel(task.department)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusReply task={task} statuses={statusesOf(task)} mayWork={mayWork(task)} onPick={(status) => setMoving({ task, status })} />
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 ${isLate(task) ? 'font-semibold text-danger-400' : 'text-steel-300'}`}>
                      {task.dueDate ? formatDate(task.dueDate) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* …and cards on a phone. */}
          <ul className="space-y-3 md:hidden">
            {shown.map((task) => (
              <li key={task._id} className={`rounded-xl border p-3 ${isHighlighted(task) ? 'border-warn-500/40 bg-warn-500/[0.08]' : 'border-line/10'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-steel-50">{task.customer?.name || task.label}</p>
                    <p className="text-xs text-steel-400">{task.label}{modelOf(task) ? ` · ${modelOf(task)}` : ''}</p>
                  </div>
                  <span className={`shrink-0 text-xs ${isLate(task) ? 'font-semibold text-danger-400' : 'text-steel-400'}`}>
                    {task.dueDate ? formatDate(task.dueDate) : ''}
                  </span>
                </div>
                <p className="mt-1 text-xs text-steel-400">
                  {task.createdBy?.name || '—'} → {task.user?.name || task.team || departmentLabel(task.department)}
                </p>
                <div className="mt-2">
                  <StatusReply task={task} statuses={statusesOf(task)} mayWork={mayWork(task)} onPick={(status) => setMoving({ task, status })} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-line/15 px-4 py-8 text-center text-sm text-steel-400">
          {tasks.length ? 'Nothing matches this filter.' : 'No department task open right now.'}
        </p>
      )}

      {moving && (
        <Modal open title={`${moving.task.label} — ${moving.task.customer?.name || ''}`} onClose={() => setMoving(null)} size="md">
          <TaskWorkflow
            todo={moving.task}
            startWith={moving.status}
            onChanged={() => {
              setMoving(null);
              reload();
            }}
          />
        </Modal>
      )}
      {assigning && (
        <DepartmentTaskDialog enquiry={null} catalogue={catalogue} kind={firstTask} onClose={() => setAssigning(false)} onSent={reload} />
      )}
    </section>
  );
}
