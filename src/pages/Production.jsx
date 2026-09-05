import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloads, production as productionApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { ProductionLineDialog } from '../components/ProductionLine.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { PRODUCTION_STAGES, productionStageLabel } from '../utils/pipeline.js';

/**
 * The plant's queue [BLUEPRINT §14–17].
 *
 * **One row per line, not per order**, and late first. The question this screen answers is what
 * to put on a press next, and the answer is whatever is furthest past the date the plant itself
 * agreed — so an order-number sort would be a list nobody can work from.
 *
 * Three figures across the top, because they are what a production head opens this for: how much
 * is still open, how much is late, and how much has stopped. The last is the one worth its own
 * count — a held line looks identical to a running one on a status column, and the difference is
 * the whole point.
 *
 * The bar on each row is what is *made* against what was ordered, not what is packed. Packing
 * follows making, and a bar that showed the packed figure would read as no progress on a line
 * where a press has been running all week.
 */

export default function Production() {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [only, setOnly] = useState('open');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const [rows, setRows] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [meta, setMeta] = useState({ open: 0, overdue: 0, held: 0, toMake: 0 });
  const [error, setError] = useState(null);

  const term = useDebounced(search);
  const filters = {
    search: term || undefined,
    status: status || undefined,
    open: only === 'open' ? 'true' : undefined,
    overdue: only === 'overdue' ? 'true' : undefined,
    held: only === 'held' ? 'true' : undefined,
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await productionApi.list({ ...filters, page, limit: 25 });
      setRows(response.data);
      setPagination(response.pagination);
      setMeta(response.meta || {});
    } catch (loadError) {
      setError(loadError);
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, status, only, page]);

  useEffect(() => {
    load();
  }, [load]);

  const mayWrite = canWrite('production');

  const narrow = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Production"
        subtitle="Every line on a released order, furthest past its date first"
        actions={<ExportButton download={downloads.production} params={filters} />}
      />

      {/* What a production head opens this screen to find out, before reading a single row. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Open lines', value: formatNumber(meta.open || 0), lit: false },
          { label: 'Past their date', value: formatNumber(meta.overdue || 0), lit: Boolean(meta.overdue) },
          { label: 'Stopped', value: formatNumber(meta.held || 0), lit: Boolean(meta.held) },
        ].map((tile) => (
          <div
            key={tile.label}
            className={`card px-4 py-3 ${tile.lit ? 'ring-1 ring-danger-500/40' : ''}`}
          >
            <p className="eyebrow">{tile.label}</p>
            <p className={`stat-value mt-1 ${tile.lit ? 'text-danger-400' : 'text-steel-50'}`}>
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search order, PO number or model…"
          value={search}
          onChange={narrow(setSearch)}
        />
        <select className="input w-48" value={status} onChange={narrow(setStatus)} aria-label="Stage">
          <option value="">All stages</option>
          {PRODUCTION_STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>{stage.label}</option>
          ))}
        </select>
        <select className="input w-44" value={only} onChange={narrow(setOnly)} aria-label="Narrow to">
          <option value="open">Everything open</option>
          <option value="overdue">Past their date</option>
          <option value="held">Stopped</option>
          <option value="">Including finished</option>
        </select>
      </div>

      {rows === null && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={load} />}

      {rows?.length === 0 && !error && (
        <EmptyState
          title="Nothing on the floor"
          description="Lines appear here once an order has passed its §13 checks and been released."
        />
      )}

      {rows?.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Model</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3 text-right">Ordered</th>
                    <th className="px-4 py-3">Made</th>
                    <th className="px-4 py-3 text-right">Packed</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Stage</th>
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {rows.map((row) => (
                    <tr key={row.lineId} className="row-hover">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-steel-100">
                          {row.modelNumber || row.mould?.mouldCode || '—'}
                        </p>
                        <p className="text-xs text-steel-400">
                          {[row.colour, row.mould?.mouldCode].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <Link to={`/orders/${row.order._id}`} className="text-steel-300 hover:text-accent">
                          {row.order.number}
                        </Link>
                        <p className="text-xs text-steel-500">{row.order.customer?.name}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                        {formatNumber(row.quantity)}
                      </td>
                      <td className="px-4 py-3.5">
                        {/*
                          Made against ordered, not packed against ordered. Packing follows
                          making, and a packed bar reads as no progress on a line where a press
                          has been running all week.
                        */}
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line/[0.08]">
                            <div
                              className={`h-full rounded-full ${row.isOverdue ? 'bg-danger-500' : 'bg-flame-500'}`}
                              style={{ width: `${row.madePercent}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-xs text-steel-300">
                            {formatNumber(row.production?.producedQty || 0)}
                          </span>
                        </div>
                        {row.toMakeQty > 0 && (
                          <p className="mt-0.5 text-[0.6875rem] text-steel-500">
                            {formatNumber(row.toMakeQty)} to go
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                        {formatNumber(row.production?.readyQty || 0)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={row.isOverdue ? 'text-danger-400' : 'text-steel-300'}>
                          {row.production?.expectedCompletion
                            ? formatDate(row.production.expectedCompletion)
                            : row.deliveryDate
                              ? formatDate(row.deliveryDate)
                              : '—'}
                        </span>
                        {row.isOverdue && (
                          <p className="text-[0.6875rem] font-semibold text-danger-400">Late</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge status={row.production?.status}>
                          {productionStageLabel(row.production?.status)}
                        </Badge>
                        {/* A hold with a reason on the row, so nobody has to open it to ask. */}
                        {row.production?.holdReason && (
                          <p className="mt-1 max-w-[14rem] truncate text-[0.6875rem] text-danger-400">
                            {row.production.holdReason}
                          </p>
                        )}
                      </td>
                      {mayWrite && (
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => setEditing(row)}
                          >
                            Record
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      )}

      <ProductionLineDialog
        order={editing ? { _id: editing.order._id, number: editing.order.number } : null}
        line={
          editing
            ? {
                _id: editing.lineId,
                modelNumber: editing.modelNumber,
                mould: editing.mould,
                colour: editing.colour,
                quantity: editing.quantity,
                production: editing.production,
              }
            : null
        }
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}
