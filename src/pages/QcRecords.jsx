import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { qcRecordsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import { QC_STAGES, QC_VERDICTS, labelOf, toneOf } from '../utils/records.js';

/**
 * Every QC record, newest first [server: records.service `listQcRecords`] — filtered by stage,
 * verdict and days. A row says what was checked, the breaking strength found, what failed and
 * whether it is signed off; the sheet itself is one click away.
 */
export default function QcRecords() {
  const { canWrite } = useAuth();
  const [filters, setFilters] = useState({ stage: '', verdict: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    const params = Object.fromEntries(Object.entries({ ...filters, page }).filter(([, value]) => value !== ''));
    return qcRecordsApi.list(params).then((next) => { setAnswer(next); setError(null); }).catch(setError);
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);
  const pick = (key) => (event) => { setPage(1); setFilters((current) => ({ ...current, [key]: event.target.value })); };
  const rows = answer?.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="QC records"
        subtitle="Test sheets — resin, mould, size, hook, clips, print, breaking strength and the verdict — each printable as a test report for the buyer."
        actions={canWrite('quality') && <Link to="/qc-records/new" className="btn-primary">New QC record</Link>}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-steel-300">Stage
          <select className="input mt-1 w-auto" value={filters.stage} onChange={pick('stage')}>
            <option value="">Every stage</option>
            {QC_STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-steel-300">Verdict
          <select className="input mt-1 w-auto" value={filters.verdict} onChange={pick('verdict')}>
            <option value="">Any verdict</option>
            {QC_VERDICTS.map((verdict) => <option key={verdict.value} value={verdict.value}>{verdict.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-steel-300">From <input type="date" className="input mt-1 w-auto" value={filters.from} onChange={pick('from')} /></label>
        <label className="text-sm text-steel-300">To <input type="date" className="input mt-1 w-auto" value={filters.to} onChange={pick('to')} /></label>
      </div>

      {error && <ErrorState error={error} onRetry={load} />}
      {!rows && !error && <TableSkeleton rows={6} columns={7} />}
      {rows && !rows.length && (
        <EmptyState
          title="No QC records here"
          description={canWrite('quality') ? 'Press New QC record to fill in the first test sheet.' : 'The quality team’s test sheets appear here.'}
        />
      )}
      {rows?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Model · size</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Resin batch</th>
                  <th className="px-4 py-3 text-right">Breaking (min)</th>
                  <th className="px-4 py-3">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.04]">
                {rows.map((row) => (
                  <tr key={row._id} className="row-hover">
                    <td className="px-4 py-3.5">
                      <Link to={`/qc-records/${row._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.number}</Link>
                      <p className="text-xs text-steel-500">{formatDate(row.inspectedAt)} · {row.inspectedBy?.name}</p>
                    </td>
                    <td className="px-4 py-3.5 text-steel-200">{labelOf(QC_STAGES, row.stage)}</td>
                    <td className="px-4 py-3.5 text-steel-200">{[row.modelNumber || row.mould?.mouldCode, row.size].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-4 py-3.5 text-steel-200">{row.customer?.name || '—'}{row.enquiry?.number && <p className="text-xs text-steel-500">{row.enquiry.number}</p>}</td>
                    <td className="px-4 py-3.5 text-steel-300">{row.resin?.batch || '—'}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                      {row.breaking?.minKg != null ? `${row.breaking.minKg} kgf` : '—'}
                      {row.breaking?.requiredKg != null && <p className="text-xs text-steel-500">needs {row.breaking.requiredKg}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge tone={toneOf(QC_VERDICTS, row.verdict)}>{labelOf(QC_VERDICTS, row.verdict)}</Badge>
                      {row.failedTests?.length > 0 && <p className="mt-1 text-xs text-danger-400">Failed {row.failedTests.join(', ')}</p>}
                      <p className="mt-1 text-xs text-steel-500">{row.approvedAt ? `Approved · ${row.approvedBy?.name || ''}` : 'Not approved yet'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pagination pagination={answer?.pagination} onChange={setPage} />
    </div>
  );
}
