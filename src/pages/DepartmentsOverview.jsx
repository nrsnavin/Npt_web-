import { useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { departments as departmentsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { DashboardSkeleton, ErrorState, PageHeader, Section } from '../components/ui.jsx';

/**
 * Admin's view of all ten departments side by side [role requirements §1: "all-department
 * dashboard … pending work and delays"]. Sorted worst first — late, then due today — so the
 * department that needs a call is the top row. Everybody else is sent to their own.
 */
export default function DepartmentsOverview() {
  const { user } = useAuth();
  const seesAll = user?.role === 'admin' || user?.department === 'management';
  const fetch = useCallback(() => (seesAll ? departmentsApi.overview() : Promise.resolve([])), [seesAll]);
  const { data, loading, error, reload } = useRecord(fetch, 'departments-overview');

  if (!seesAll) return <Navigate to="/departments/mine" replace />;
  if (loading && !data) return <DashboardSkeleton label="Loading the departments" tiles={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const rows = [...(data || [])].sort((a, b) => b.late - a.late || b.dueToday - a.dueToday || b.open - a.open);
  const totals = rows.reduce((sum, row) => ({
    late: sum.late + row.late, dueToday: sum.dueToday + row.dueToday, open: sum.open + row.open,
  }), { late: 0, dueToday: 0, open: 0 });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="All departments"
        subtitle={`${totals.open} open tasks · ${totals.late} late · ${totals.dueToday} due today`}
      />
      <Section>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-steel-500">
                <th className="py-2 pr-3">Department</th>
                <th className="px-3 py-2 text-right">Late</th>
                <th className="px-3 py-2 text-right">Due today</th>
                <th className="px-3 py-2 text-right">Not picked up</th>
                <th className="px-3 py-2 text-right">Open</th>
                <th className="px-3 py-2 text-right">Done this week</th>
                <th className="px-3 py-2 text-right">On time</th>
                <th className="py-2 pl-3 text-right">Avg. time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/[0.06]">
              {rows.map((row) => (
                <tr key={row.department}>
                  <td className="py-2.5 pr-3">
                    <Link to={`/departments/${row.department}`} className="font-semibold text-steel-100 hover:text-accent">
                      {row.label}
                    </Link>
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${row.late ? 'font-bold text-danger-400' : 'text-steel-500'}`}>{row.late}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${row.dueToday ? 'text-warn-400' : 'text-steel-500'}`}>{row.dueToday}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-steel-300">{row.unclaimed}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-steel-300">{row.open}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-success-400">{row.doneThisWeek}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-steel-300">{row.onTimePercent === null ? '—' : `${row.onTimePercent}%`}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-steel-300">{row.averageHoursToDone === null ? '—' : `${row.averageHoursToDone} h`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
