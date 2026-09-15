import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quality as qualityApi } from '../api/endpoints.js';
import { useDebounced } from '../hooks/useRecords.js';
import useQualityOptions from '../hooks/useQualityOptions.js';
import {
  Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import {
  INSPECTION_STAGES, VERDICTS, inspectionStageLabel, verdictLabel, verdictTone,
} from '../utils/pipeline.js';

/**
 * Every inspection [BLUEPRINT §15].
 *
 * The register beside the bench's day screen, and a different tool from it. The day screen is a
 * shortlist of what is stopping something; this is for looking something up — what did we find
 * on this tool, what did that order's final inspection say, when was this model last checked.
 *
 * Newest first, because an inspection is a fact about a moment and the most recent one is what
 * is true now. The **held** filter is the one a quality head reaches for first and it is a
 * button rather than a buried option, for the same reason the plant's "stopped" filter is.
 */

const TONE = {
  success: 'text-success-400',
  warn: 'text-warn-400',
  danger: 'text-danger-400',
  neutral: 'text-steel-300',
};

export default function Quality() {
  /* The sixteen defect names live on the server; an inspection stores only the key, so
     without this the column printed `short_shot` at people. */
  const { defectLabel } = useQualityOptions();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [verdict, setVerdict] = useState('');
  const [only, setOnly] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [error, setError] = useState(null);
  const { sort, toggle } = useSort();

  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };

  const term = useDebounced(search);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await qualityApi.list({
        search: term || undefined,
        stage: stage || undefined,
        /* `held` and `verdict` write the same filter on the server, so only one is sent — and
           held wins, because it is the more specific question. */
        verdict: only === 'held' ? undefined : verdict || undefined,
        held: only === 'held' ? 'true' : undefined,
        sort: sort || undefined,
        page,
        limit: 25,
      });
      setRows(response.data);
      setPagination(response.pagination);
    } catch (loadError) {
      setError(loadError);
      setRows([]);
    }
  }, [term, stage, verdict, only, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  const narrow = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Quality"
        subtitle="Every inspection, newest first"
        actions={<Link to="/quality/report" className="btn-secondary">The report</Link>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search reference, model or remarks…"
          value={search}
          onChange={narrow(setSearch)}
        />
        <select className="input w-48" value={stage} onChange={narrow(setStage)} aria-label="Stage">
          <option value="">Every stage</option>
          {INSPECTION_STAGES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select
          className="input w-56"
          value={only === 'held' ? 'held' : verdict}
          onChange={(event) => {
            const value = event.target.value;
            setOnly(value === 'held' ? 'held' : '');
            setVerdict(value === 'held' ? '' : value);
            setPage(1);
          }}
          aria-label="Verdict"
        >
          <option value="">Every verdict</option>
          {/* First, because it is the question this screen is opened with. */}
          <option value="held">Only what is held</option>
          {VERDICTS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {rows === null && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={load} />}

      {rows?.length === 0 && !error && (
        <EmptyState
          title="Nothing inspected"
          description="An inspection is recorded against a line of a released order, from the order's own screen."
        />
      )}

      {rows?.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <SortHeader field="modelNumber" label="Model" sort={sort} onToggle={sortBy} className="px-4" />
                    <th className="px-4 py-3">Order</th>
                    <SortHeader field="stage" label="Stage" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="quantityInspected" label="Checked" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    {/*
                      The rejection *percentage* is what a quality head really wants ranked, and
                      it is divided out on the way out of the record — so the server has nothing
                      to sort and refuses the key. The count is the honest version of the same
                      question, and it is the one that matters when deciding what to do about a
                      mould: worst batches by volume, not by ratio on a sample of forty.
                    */}
                    <SortHeader field="quantityRejected" label="Rejected" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    <th className="px-4 py-3">What was wrong</th>
                    <SortHeader field="inspectedAt" label="Checked on" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="verdict" label="Verdict" sort={sort} onToggle={sortBy} className="px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {rows.map((row) => (
                    <tr key={row._id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-steel-100">
                          {row.modelNumber || row.mould?.mouldCode || '—'}
                        </p>
                        <p className="text-xs text-steel-400">
                          {[row.colour, row.mould?.mouldCode].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        {row.order?._id ? (
                          <Link to={`/orders/${row.order._id}`} className="text-steel-300 hover:text-accent">
                            {row.order.number}
                          </Link>
                        ) : (
                          <span className="text-steel-500">—</span>
                        )}
                        <p className="text-xs text-steel-500">{row.order?.customer?.name}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-steel-300">{inspectionStageLabel(row.stage)}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                        {formatNumber(row.quantityInspected)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <span className={row.quantityRejected ? 'font-semibold text-danger-400' : 'text-steel-400'}>
                          {formatNumber(row.quantityRejected)}
                        </span>
                        {row.rejectionPercent > 0 && (
                          <p className="text-xs text-steel-500">{row.rejectionPercent}%</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {/* The faults, on the row. Which defect it was decides who gets rung —
                            a short shot is the press, a wrong shade is the material store. */}
                        {row.defects?.length ? (
                          <p className="max-w-[16rem] truncate text-xs text-steel-300">
                            {row.defects.map((defect) => defectLabel(defect.type)).join(', ')}
                          </p>
                        ) : (
                          <span className="text-xs text-steel-500">Nothing found</span>
                        )}
                      </td>
                      {/* The day it was checked, out from under the stage label and into a
                          column of its own, so the register can be read newest-first. */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-steel-400">
                        {formatDate(row.inspectedAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge status={row.verdict}>{verdictLabel(row.verdict)}</Badge>
                        {row.holdsTheLine && (
                          <p className={`mt-1 text-xs font-semibold ${TONE.danger}`}>Line held</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      )}
    </div>
  );
}
