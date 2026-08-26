import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { samples as samplesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import {
  SAMPLE_PURPOSES, SAMPLE_STAGES, followUpState, optionLabel, sampleStageLabel,
} from '../utils/pipeline.js';

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/**
 * The bench: where every request is, and how much of it is late.
 *
 * Overdue is called out per stage rather than as one total, because "three overdue" is not
 * actionable and "three sitting in production required" is.
 */
function Bench({ selected, onSelect }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    samplesApi.pipeline().then(setRows).catch(() => setRows([]));
  }, []);

  const live = rows.filter((row) => row.count > 0 || row.status === selected);
  if (!live.length) return null;

  return (
    <div role="tablist" aria-label="Filter by stage" className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {live.map((row) => {
        const active = selected === row.status;
        return (
          <button
            key={row.status}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(active ? '' : row.status)}
            className={`card-interactive px-3.5 py-3 text-left ${active ? '!border-flame-500/40' : ''}`}
          >
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
              {sampleStageLabel(row.status)}
            </p>
            <p className="mt-1 text-lg font-extrabold tabular-nums leading-none tracking-tight text-steel-50">
              {row.count}
            </p>
            <p className={`mt-1 text-xs tabular-nums ${row.overdue ? 'text-danger-400' : 'text-steel-500'}`}>
              {row.overdue ? `${row.overdue} overdue` : 'on time'}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export default function Samples() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('open');
  const [page, setPage] = useState(1);

  const term = useDebounced(search);
  const { data, pagination, loading, error, reload } = useRecordList(samplesApi.list, {
    search: term || undefined,
    status: status || undefined,
    open: view === 'open' || view === 'overdue' || view === 'unassigned' ? 'true' : undefined,
    overdue: view === 'overdue' ? 'true' : undefined,
    unassigned: view === 'unassigned' ? 'true' : undefined,
    mine: view === 'mine' ? 'true' : undefined,
    page,
    limit: 25,
  });

  const change = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  // Only someone who works the bench has a personal queue worth filtering to.
  const worksTheBench = user?.department === 'sampling' || user?.role === 'admin';

  const views = [
    { value: 'open', label: 'Open' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'unassigned', label: 'Unassigned' },
    ...(worksTheBench ? [{ value: 'mine', label: 'Mine' }] : []),
    { value: 'all', label: 'All' },
  ];

  const emptyCopy = {
    overdue: 'Nothing is past its required date. That is the whole point.',
    unassigned: 'Every open request has someone on it.',
    mine: 'Nothing assigned to you. Pick something off the unassigned queue.',
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Sampling"
        subtitle="Requests raised from enquiries, through the bench to the customer's answer"
      />

      <Bench selected={status} onSelect={change(setStatus)} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search number, model or colour…"
          value={search}
          onChange={(event) => change(setSearch)(event.target.value)}
        />

        <div role="tablist" aria-label="View" className="tab-track grid-flow-col">
          {views.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              onClick={() => change(setView)(option.value)}
              className="tab py-1.5"
            >
              {option.label}
            </button>
          ))}
        </div>

        <select
          className="input w-52"
          aria-label="Stage"
          value={status}
          onChange={(event) => change(setStatus)(event.target.value)}
        >
          <option value="">All stages</option>
          {SAMPLE_STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>{stage.label}</option>
          ))}
        </select>
      </div>

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title={view === 'overdue' ? 'Nothing overdue' : 'No sample requests here'}
          description={
            emptyCopy[view] ||
            'A request appears the moment marketing moves an enquiry to sample required.'
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-3">Request</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Model</th>
                    <th className="px-3 py-3">Purpose</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3">Required by</th>
                    <th className="px-3 py-3">With</th>
                    <th className="px-3 py-3">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((sample) => {
                    const due = followUpState(sample.requiredDate);
                    return (
                      <tr key={sample._id} className="row-hover">
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <Link to={`/samples/${sample._id}`} className="font-semibold text-steel-100 hover:text-accent">
                            {sample.number}
                          </Link>
                          <p className="text-xs text-steel-400">{sample.enquiry?.number}</p>
                        </td>
                        <td className="px-3 py-3.5 text-steel-200">{sample.customer?.name || '—'}</td>
                        <td className="px-3 py-3.5">
                          <p className="text-steel-200">{sample.modelNumber || '—'}</p>
                          {sample.colour && <p className="text-xs text-steel-500">{sample.colour}</p>}
                        </td>
                        <td className="px-3 py-3.5 text-steel-300">
                          {optionLabel(SAMPLE_PURPOSES, sample.purpose)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-200">
                          {formatNumber(sample.quantity)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <p className="text-steel-300">{formatDate(sample.requiredDate)}</p>
                          {due && sample.isOverdue && (
                            <p className={`text-xs ${TONE_TEXT[due.tone]}`}>{due.text}</p>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-steel-300">
                          {sample.assignedTo?.name || (
                            <span className="text-xs text-steel-500">Unassigned</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <Badge status={sample.status}>{sampleStageLabel(sample.status)}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      ))}
    </div>
  );
}
