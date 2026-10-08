import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import {
  EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import { activityLabel, formatWhen, useActivityTypes } from '../components/EnquiryActivities.jsx';
import { inDays } from '../utils/pipeline.js';

/**
 * Recent calls, WhatsApps, emails, visits and meetings across the enquiries this person may see
 * [role requirements §2, marketing pages: "Activities: recent calls"]. A marketing person sees
 * their own book; Admin sees everybody's. Each row opens its enquiry, where the call is logged.
 */
const RANGES = [
  { key: '', label: 'Any time' },
  { key: 'today', label: 'Today', from: () => inDays(0) },
  { key: 'week', label: 'Last 7 days', from: () => inDays(-7) },
  { key: 'month', label: 'Last 30 days', from: () => inDays(-30) },
];

export default function Activities() {
  const types = useActivityTypes();
  const [type, setType] = useState('');
  const [range, setRange] = useState('week');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [byType, setByType] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const from = RANGES.find((row) => row.key === range)?.from?.();
      const response = await enquiriesApi.activities({ type: type || undefined, from, page, limit: 25 });
      setRows(response.data);
      setPagination(response.pagination);
      setByType(response.byType || {});
    } catch (loadError) {
      setError(loadError);
    }
  }, [type, range, page]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Activities"
        subtitle="Calls, WhatsApps, emails, visits and meetings logged on enquiries — log one from the enquiry"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={range} onChange={pick(setRange)} aria-label="When">
          {RANGES.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
        </select>
        <select className="input w-auto" value={type} onChange={pick(setType)} aria-label="Kind">
          <option value="">Every kind</option>
          {types.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
        </select>
        <span className="text-xs text-steel-400">
          {types.filter((row) => byType[row.key]).map((row) => `${row.label} ${byType[row.key]}`).join(' · ')}
        </span>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !rows ? (
        <TableSkeleton rows={6} columns={5} />
      ) : !rows.length ? (
        <EmptyState
          title="Nothing logged in this range"
          description="Open an enquiry and press Log a call after each conversation with the buyer."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Enquiry</th>
                  <th className="px-4 py-3">Spoke to</th>
                  <th className="px-4 py-3">What was said</th>
                  <th className="px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.04]">
                {rows.map((row) => (
                  <tr key={row._id} className="row-hover">
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-steel-400">{formatWhen(row.at)}</td>
                    <td className="px-4 py-3.5 text-steel-200">{activityLabel(types, row.type)}</td>
                    <td className="px-4 py-3.5">
                      <Link to={`/enquiries/${row.enquiry._id}`} className="font-semibold text-steel-100 hover:text-accent">
                        {row.enquiry.number}
                      </Link>
                      <p className="text-xs text-steel-500">
                        {row.enquiry.customer?.name}
                        {row.enquiry.modelNumber && ` · ${row.enquiry.modelNumber}`}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 text-steel-300">{row.spokeTo || '—'}</td>
                    <td className="max-w-md px-4 py-3.5 text-steel-300">{row.note}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-steel-400">{row.by?.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pagination pagination={pagination} onChange={setPage} />
    </div>
  );
}
