import { useCallback, useEffect, useState } from 'react';
import { taskQueries } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { DashboardSkeleton, EmptyState, ErrorState, Modal, Notice, PageHeader } from '../components/ui.jsx';
import { QueryCard } from '../components/TaskQueries.jsx';
import { forgetQuerySubjects, useQuerySubjects } from '../components/SubjectPicker.jsx';

/**
 * Task queries [server: taskQuery.service `queryBoard`]: the questions put to me — on tasks I
 * raised and enquiries I hold — the ones my team and I asked, and, for Admin, every open one.
 * Answered and followed up right here; the answer goes back onto the task it was asked on.
 */
const TABS = [
  { key: 'forMe', label: 'For me', empty: 'Nobody is waiting on you for an answer.' },
  { key: 'asked', label: 'We asked', empty: 'No open queries from you or your team.' },
  { key: 'everyOpen', label: 'All open', empty: 'No query is waiting for an answer.', admin: true },
];

/** Admin: the subject list — rename one, take it off the drop-down, or put it back [server: querySubjects.service]. */
function ManageSubjects({ onClose }) {
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [problem, setProblem] = useState(null);
  const load = useCallback(() => {
    taskQueries.subjects({ all: true }).then((data) => {
      setRows(data);
      setNames(Object.fromEntries(data.map((row) => [row._id, row.name])));
    }).catch((error) => setProblem(error.message));
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = (row, payload) => async () => {
    setProblem(null);
    try {
      await taskQueries.editSubject({ id: row._id, ...payload });
      forgetQuerySubjects();
      load();
    } catch (error) {
      setProblem(error.message);
    }
  };
  return (
    <Modal open title="Query subjects" description="Everyone picks from this list; anybody can add one when asking. Renaming does not change queries already filed." onClose={onClose} size="lg">
      {problem && <div className="mb-3"><Notice tone="danger">{problem}</Notice></div>}
      {!rows ? <DashboardSkeleton tiles={2} /> : (
        <ul className="divide-y divide-line/[0.06]">
          {rows.map((row) => (
            <li key={row._id} className="flex flex-wrap items-center gap-2 py-2">
              <input
                className={`input flex-1 ${row.hidden ? 'opacity-60' : ''}`}
                aria-label={`Rename ${row.name}`}
                value={names[row._id] ?? ''}
                onChange={(event) => setNames((current) => ({ ...current, [row._id]: event.target.value }))}
                maxLength={60}
              />
              {names[row._id]?.trim() && names[row._id].trim() !== row.name && (
                <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={save(row, { name: names[row._id].trim() })}>Rename</button>
              )}
              <button type="button" className="row-action" onClick={save(row, { hidden: !row.hidden })}>{row.hidden ? 'Put back' : 'Remove'}</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function TaskQueriesPage() {
  const { isManagement } = useAuth();
  const [tab, setTab] = useState('forMe');
  const [showClosed, setShowClosed] = useState(false);
  const [subject, setSubject] = useState('');
  const [managing, setManaging] = useState(false);
  const subjects = useQuerySubjects();
  const [state, setState] = useState({ data: null, error: null });
  const load = useCallback(() => {
    taskQueries.board({ ...(showClosed ? { show: 'all' } : {}), ...(subject ? { subject } : {}) })
      .then((data) => setState({ data, error: null }))
      .catch((error) => setState({ data: null, error }));
  }, [showClosed, subject]);
  useEffect(() => { load(); }, [load]);
  const tabs = TABS.filter((entry) => !entry.admin || isManagement);
  const current = tabs.find((entry) => entry.key === tab) || tabs[0];
  const rows = state.data?.[current.key] || [];
  const waiting = (key) => (state.data?.[key] || []).filter((query) => query.status === 'open').length;
  return (
    <div className="space-y-4">
      <PageHeader title="Task queries" subtitle="Questions on tasks and enquiries, to whoever raised the work — and their answers" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Which queries" className="flex flex-wrap gap-1.5">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={entry.key === current.key}
              className={entry.key === current.key ? 'btn-primary px-3 py-1.5 text-sm' : 'btn-secondary px-3 py-1.5 text-sm'}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
              {state.data && waiting(entry.key) > 0 && <span className="ml-1.5 rounded-full bg-warn-500/20 px-1.5 text-xs tabular-nums">{waiting(entry.key)}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-auto" aria-label="Filter by subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
            <option value="">Every subject</option>
            {subjects.map((row) => <option key={row._id} value={row.name}>{row.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-steel-300">
            <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
            Show closed
          </label>
          {isManagement && <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setManaging(true)}>Subjects</button>}
        </div>
      </div>
      {managing && <ManageSubjects onClose={() => setManaging(false)} />}
      {state.error ? (
        <ErrorState error={state.error} onRetry={load} />
      ) : !state.data ? (
        <DashboardSkeleton />
      ) : rows.length ? (
        <div className="space-y-2">
          {rows.map((query) => <QueryCard key={query._id} query={query} onChanged={load} showWhere />)}
        </div>
      ) : (
        <EmptyState title="Nothing here" description={current.empty} />
      )}
    </div>
  );
}
