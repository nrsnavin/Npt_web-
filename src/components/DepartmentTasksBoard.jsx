import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { overview } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import TaskPanel from './TaskPanel.jsx';
import DeskTabs, { firstDeskTab } from './DeskTabs.jsx';
import DepartmentTaskDialog from './DepartmentTaskDialog.jsx';
import { ErrorState, TableSkeleton } from './ui.jsx';
import { formatDate, humanise } from '../utils/format.js';
import { DEPARTMENT_CHOICES, departmentLabel, deskOf } from '../utils/pipeline.js';
import { EDD_CHIP, eddChipOf } from '../utils/edd.js';

/**
 * Department Tasks [the plant's own layout]: every open request this person follows — Admin all
 * of them, a marketing person those on their own customers and the ones they raised, a department
 * its own queue [server: overview.service `trackedTasks`].
 *
 * One row a task: Customer / Model · Requested by / Assigned to · Status reply · Due. The status
 * is a list for whoever works the task (its department, or Admin) — picking a step opens the
 * move with its remark and date [components/TaskWorkflow.jsx]; anyone else reads it. Every row
 * opens into the task itself [components/TaskPanel.jsx]: what was asked, its updates, and for
 * whoever works it, Update / Done / Send back / Change date — so Admin works any department's
 * task from here. A late or urgent task is highlighted, and "Highlighted" shows just those.
 *
 * Admin picks any department — every one is listed, even with nothing open — and everyone can
 * switch between open, done and all [server: `trackedTasks` `department`, `state`].
 */

const STATES = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'Open and done' },
];

const DAY = 24 * 60 * 60 * 1000;

const isLate = (task) => Boolean(!task.completed && task.dueDate && new Date(task.dueDate).getTime() < Date.now());
export const isHighlighted = (task) => isLate(task) || (!task.completed && ['high', 'urgent'].includes(task.priority));
const isFresh = (task) => Date.now() - new Date(task.createdAt).getTime() < DAY;

/** The due day — or, once finished, the day it was done. */
const whenOf = (task) => {
  if (task.completed) return task.completedAt ? `Done ${formatDate(task.completedAt)}` : 'Done';
  return task.dueDate ? formatDate(task.dueDate) : '';
};

const emptyLine = (state, department) => {
  const which = { open: 'No open task', done: 'No finished task', all: 'No task' }[state] || 'No task';
  return `${which}${department ? ` for ${departmentLabel(department)}` : ''} right now.`;
};

const modelOf = (task) =>
  task.enquiry?.requirement?.modelNumber || task.enquiry?.items?.find((item) => item.modelNumber)?.modelNumber || null;

/** The EDD on a Production, Assembly, Printing or Dispatch row — or that it is still wanted. */
function EddChip({ task }) {
  const edd = eddChipOf(task);
  if (!edd) return null;
  return <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${EDD_CHIP[edd.tone]}`}>{edd.label}</span>;
}

function StatusReply({ task, statuses, mayWork, onPick }) {
  const current = statuses.find((entry) => entry.key === task.status);
  if (!statuses.length || !mayWork || task.completed) {
    return <span className="text-sm text-steel-200">{current?.label || humanise(task.status) || (task.completed ? 'Done' : 'Open')}</span>;
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

export default function DepartmentTasksBoard({
  title = 'Department Tasks',
  subtitle = 'Follow the progress of requests for your customers.',
  /* The page's own heading when the board is the whole page (/tasks); a section heading on the dashboard. */
  headingAs = 'h2',
  department: chosenDepartment = '',
  state: chosenState = 'open',
  onFilter,
}) {
  const { isManagement: isAdmin, departments = [], user } = useAuth();
  const me = String(user?.id || user?._id || '');
  /* Controlled by the page when it keeps them in the address; held here otherwise. */
  const [ownDepartment, setOwnDepartment] = useState(chosenDepartment);
  const [ownState, setOwnState] = useState(chosenState);
  const department = onFilter ? chosenDepartment : ownDepartment;
  const state = onFilter ? chosenState : ownState;
  const setFilter = (next) => {
    if (onFilter) return onFilter({ department, state, ...next });
    if ('department' in next) setOwnDepartment(next.department);
    if ('state' in next) setOwnState(next.state);
    return null;
  };
  const fetch = useCallback(
    () => overview.tasks({ ...(department ? { department } : {}), state }),
    [department, state],
  );
  const { data, loading, error, reload } = useRecord(fetch, `overview-tasks-${department}-${state}`);
  const catalogue = useHandoffCatalogue();
  const [chip, setChip] = useState('all');
  const [search, setSearch] = useState('');
  /* The task opened in its panel — from a status picked on the row, or from Open. */
  const [opened, setOpened] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const firstTask = (catalogue?.buttons || []).find((button) => button.department && !button.hidden && button.form)?.key;
  const mayAssign = isAdmin || departments.includes('marketing');

  /* A shared desk picked (Quality · Printing · Assembling): one team at a time, as tabs across the top. */
  const desk = department && deskOf(department)?.key === department ? deskOf(department) : null;
  const [deskChoice, setDeskChoice] = useState(null);
  const deskTab = desk ? (desk.departments.includes(deskChoice) ? deskChoice : firstDeskTab(desk.departments, departments)) : null;
  const everyTask = useMemo(() => data || [], [data]);
  const tasks = useMemo(() => (deskTab ? everyTask.filter((task) => task.department === deskTab) : everyTask), [everyTask, deskTab]);
  const deskCounts = desk ? Object.fromEntries(desk.departments.map((key) => [key, everyTask.filter((task) => task.department === key).length])) : {};
  const teams = useMemo(() => [...new Set(tasks.map((task) => task.department).filter(Boolean))], [tasks]);
  /* The payment reminders people put on their own list — Admin's every one, a marketing person's their own. */
  const isPaymentFollowUp = (task) => task.kind === 'my_payment_followup';
  const chips = [
    { key: 'all', label: 'All', count: tasks.length },
    { key: 'new', label: 'New', count: tasks.filter(isFresh).length },
    { key: 'highlighted', label: 'Highlighted', count: tasks.filter(isHighlighted).length },
    { key: 'payment', label: 'My Payment Follow-up', count: tasks.filter(isPaymentFollowUp).length },
    ...teams.map((team) => ({ key: team, label: departmentLabel(team), count: tasks.filter((task) => task.department === team).length })),
  ];
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (chip === 'new' && !isFresh(task)) return false;
      if (chip === 'highlighted' && !isHighlighted(task)) return false;
      if (chip === 'payment' && !isPaymentFollowUp(task)) return false;
      if (!['all', 'new', 'highlighted', 'payment'].includes(chip) && task.department !== chip) return false;
      if (!term) return true;
      return [task.customer?.name, task.enquiry?.number, modelOf(task), task.label, task.createdBy?.name, task.user?.name]
        .filter(Boolean).some((text) => text.toLowerCase().includes(term));
    });
  }, [tasks, chip, search]);

  /* The server's rule [handoff.service `mayWorkOnHandoff`]: Admin, the person it is assigned to, or its department. */
  const mayWork = (task) => isAdmin || (me && String(task.user?._id || task.user || '') === me) || departments.includes(task.department);
  const statusesOf = (task) => buttonFor(catalogue, task.kind)?.form?.statuses || [];
  /* One team on screen at a time on a shared desk — its tab picks which. */
  const sections = [{ key: 'all', label: null, rows: shown }];

  return (
    <section className="card space-y-4 p-4 sm:p-5" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {headingAs === 'h1'
            ? <h1 className="text-lg font-bold text-steel-50">{title}</h1>
            : <h2 className="text-lg font-bold text-steel-50">{title}</h2>}
          <p className="text-sm text-steel-400">{subtitle}</p>
        </div>
        {mayAssign && firstTask && (
          <button type="button" className="btn-primary" onClick={() => setAssigning(true)}>+ Assign Task</button>
        )}
      </div>

      {desk && (
        <DeskTabs departments={desk.departments} counts={deskCounts} value={deskTab} onChange={(key) => { setDeskChoice(key); setChip('all'); }} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-pressed={chip === entry.key}
            onClick={() => setChip(entry.key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              chip === entry.key ? 'fill-primary border-transparent' : 'border-line/[0.12] text-steel-300 hover:border-line/25'
            }`}
          >
            {entry.label} <span className="tabular-nums opacity-75">{entry.count}</span>
          </button>
        ))}
        {isAdmin && (
          <select
            aria-label="Department"
            className="input w-auto py-1.5 text-sm sm:ml-auto"
            value={department}
            onChange={(event) => { setFilter({ department: event.target.value }); setChip('all'); }}
          >
            <option value="">All departments</option>
            {DEPARTMENT_CHOICES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        )}
        <select
          aria-label="Open or done"
          className={`input w-auto py-1.5 text-sm ${isAdmin ? '' : 'sm:ml-auto'}`}
          value={state}
          onChange={(event) => { setFilter({ state: event.target.value }); setChip('all'); }}
        >
          {STATES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </select>
        <input aria-label="Search customer, model or person"
          type="search"
          className="input w-full sm:w-60"
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
                {sections.map((section) => [
                  section.label && (
                    <tr key={`head-${section.key}`} className="border-t border-line/10 bg-line/[0.03]">
                      <th scope="colgroup" colSpan={4} className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-steel-300">{section.label} <span className="font-normal normal-case tabular-nums text-steel-500">{section.rows.length}</span></th>
                    </tr>
                  ),
                  ...section.rows.map((task) => (
                  <tr key={task._id} data-highlighted={isHighlighted(task) || undefined} className={`border-t border-line/10 align-top ${isHighlighted(task) ? 'bg-warn-500/[0.08]' : ''}`}>
                    <td className="px-4 py-3">
                      <button type="button" className="text-left font-semibold text-steel-50 hover:text-accent" onClick={() => setOpened({ task })}>
                        {task.customer?.name || task.label}
                      </button>
                      <p className="text-xs text-steel-400">
                        {task.label}
                        {modelOf(task) ? ` · ${modelOf(task)}` : ''}
                        {eddChipOf(task) && <> · <EddChip task={task} /></>}
                        {task.suggestion?.kind === 'escalate_prt' && !task.completed && <> · <span className="font-semibold text-warn-400">Escalate to PRT?</span></>}
                        {task.enquiry?.number && <> · <Link className="text-accent hover:underline" to={`/enquiries/${task.enquiry._id}`}>{task.enquiry.number}</Link></>}
                        {' · '}
                        <button type="button" className="row-action" onClick={() => setOpened({ task })}>{mayWork(task) && !task.completed ? 'Open / update' : 'Open'}</button>
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-steel-100">{task.createdBy?.name || '—'}</p>
                      <p className="text-xs text-steel-400">{task.user?.name || task.team || departmentLabel(task.department)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusReply task={task} statuses={statusesOf(task)} mayWork={mayWork(task)} onPick={(status) => setOpened({ task, status })} />
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 ${isLate(task) ? 'font-semibold text-danger-400' : 'text-steel-300'}`}>
                      {whenOf(task) || '—'}
                    </td>
                  </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          {/* …and cards on a phone. */}
          <ul className="space-y-3 md:hidden">
            {sections.map((section) => [
              section.label && <li key={`head-${section.key}`} className="pt-1 text-xs font-bold uppercase tracking-wide text-steel-300">{section.label}</li>,
              ...section.rows.map((task) => (
              <li key={task._id} className={`rounded-xl border p-3 ${isHighlighted(task) ? 'border-warn-500/40 bg-warn-500/[0.08]' : 'border-line/10'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-steel-50">{task.customer?.name || task.label}</p>
                    <p className="text-xs text-steel-400">{task.label}{modelOf(task) ? ` · ${modelOf(task)}` : ''}{eddChipOf(task) && <> · <EddChip task={task} /></>}</p>
                  </div>
                  <span className={`shrink-0 text-xs ${isLate(task) ? 'font-semibold text-danger-400' : 'text-steel-400'}`}>
                    {whenOf(task)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-steel-400">
                  {task.createdBy?.name || '—'} → {task.user?.name || task.team || departmentLabel(task.department)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <StatusReply task={task} statuses={statusesOf(task)} mayWork={mayWork(task)} onPick={(status) => setOpened({ task, status })} />
                  <button type="button" className="row-action" onClick={() => setOpened({ task })}>{mayWork(task) && !task.completed ? 'Open / update' : 'Open'}</button>
                </div>
              </li>
              )),
            ])}
          </ul>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-line/15 px-4 py-8 text-center text-sm text-steel-400">
          {tasks.length ? 'Nothing matches this filter.' : emptyLine(state, deskTab || department)}
        </p>
      )}

      {opened && (
        <TaskPanel
          task={opened.task}
          startWith={opened.status}
          mayWork={mayWork(opened.task)}
          onClose={() => setOpened(null)}
          onChanged={() => {
            setOpened(null);
            reload();
          }}
        />
      )}
      {assigning && (
        <DepartmentTaskDialog enquiry={null} catalogue={catalogue} kind={firstTask} onClose={() => setAssigning(false)} onSent={reload} />
      )}
    </section>
  );
}
