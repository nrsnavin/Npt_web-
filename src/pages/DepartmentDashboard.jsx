import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { departments as departmentsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import HandoffTaskList from '../components/HandoffTaskList.jsx';
import { WorkspaceBrief, WorkspaceLinks } from '../components/DepartmentWorkspace.jsx';
import { DashboardSkeleton, ErrorState, PageHeader, Section } from '../components/ui.jsx';

/**
 * One department's dashboard [server: handoff.service `departmentDashboard`].
 *
 * Leads with the four numbers a department head acts on — late, due today, nobody has picked
 * it up, done this week — then the queue itself, late first. Below it, the other half every
 * department has: what it is waiting on from others, and what came back this week. For
 * marketing that half is the "department updates" the role requirements ask for.
 *
 * The screens a department works from and its brief are drawn from `config/departments.js`.
 */

function Tile({ label, value, hint, tone = 'text-steel-50' }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-steel-400">{hint}</p>}
    </div>
  );
}

export default function DepartmentDashboard() {
  const { key = 'mine' } = useParams();
  const { user } = useAuth();
  const fetch = useCallback(() => departmentsApi.dashboard(key), [key]);
  const { data, loading, error, reload } = useRecord(fetch, `department-${key}`);

  if (loading && !data) return <DashboardSkeleton label="Loading the department" tiles={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { figures, queue, recentlyDone, waitingOnOthers, cameBack, atStages } = data;
  const seesAll = user?.role === 'admin' || user?.department === 'management';

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={figures.label}
        subtitle="Tasks other departments have sent, and what this department is waiting on"
        actions={seesAll && <Link to="/departments" className="btn-secondary">All departments</Link>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Late" value={figures.late} tone={figures.late ? 'text-danger-400' : 'text-success-400'} hint="Past the end of the day they were due" />
        <Tile label="Due today" value={figures.dueToday} tone={figures.dueToday ? 'text-warn-400' : 'text-steel-50'} hint="By the end of today" />
        <Tile label="Waiting to be picked up" value={figures.unclaimed} hint={`${figures.open} open in all`} />
        <Tile
          label="Done this week"
          value={figures.doneThisWeek}
          tone="text-success-400"
          hint={[
            figures.onTimePercent !== null && `${figures.onTimePercent}% on time`,
            figures.averageHoursToDone !== null && `${figures.averageHoursToDone} h on average`,
            figures.sentBackThisWeek ? `${figures.sentBackThisWeek} sent back` : null,
          ].filter(Boolean).join(' · ') || 'Last 30 days for speed'}
        />
      </div>

      <WorkspaceLinks department={figures.department} label={figures.label} atStages={atStages} />

      <Section title={`The queue (${queue.length})`}>
        <HandoffTaskList tasks={queue} onChanged={reload} empty="Nothing waiting — every task sent to this department is done." />
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={`Waiting on other departments (${waitingOnOthers.length})`}>
          <HandoffTaskList tasks={waitingOnOthers} perspective="sender" onChanged={reload} empty="Nothing sent out is still open." />
        </Section>
        <Section title={`Came back this week (${cameBack.length})`}>
          <HandoffTaskList tasks={cameBack} perspective="sender" empty="Nothing came back this week." />
        </Section>
      </div>

      <Section title={`Done by ${figures.label} this week (${recentlyDone.length})`}>
        <HandoffTaskList tasks={recentlyDone} empty="Nothing finished this week yet." />
      </Section>

      <WorkspaceBrief department={figures.department} label={figures.label} />
    </div>
  );
}
