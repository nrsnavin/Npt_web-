import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { payments as paymentsApi } from '../api/endpoints.js';
import { useDebounced } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';

/**
 * Everything owed [BLUEPRINT §20].
 *
 * The register beside the chase screen, and a different tool from it. The day screen is a
 * shortlist that says who to ring and why; this is for looking something up — what does this
 * buyer owe across every invoice, what is on hold, what has been settled. Soonest due first,
 * because that is the order the money matters in.
 *
 * The three figures across the top are the open set rather than the page, and that is the
 * server's doing: `balance` and `state` are derived from the receipts rather than stored, so
 * "what is still owed" cannot be a database filter — and a headline computed over one page
 * would change when somebody turned it, which reads as the debt changing.
 */

/** The one word that answers "where does this stand", with the arithmetic behind it. */
const STATE_LABELS = {
  paid: 'Paid',
  part_paid: 'Part paid',
  overdue: 'Overdue',
  due_today: 'Due today',
  due_soon: 'Due soon',
  not_due: 'Not due yet',
  disputed: 'Disputed',
  on_hold: 'On hold',
};

export default function Payments() {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);

  const term = useDebounced(search);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await paymentsApi.list({
        search: term || undefined,
        kind: kind || undefined,
        page,
        limit: 25,
      });
      setRows(response.data);
      setPagination(response.pagination);
      setMeta(response.meta || {});
    } catch (loadError) {
      setError(loadError);
      setRows([]);
    }
  }, [term, kind, page]);

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
        title="Payments"
        subtitle="Everything owed, soonest due first"
        actions={<Link to="/" className="btn-secondary">Today's chase</Link>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Owed', value: formatCurrency(meta.outstanding || 0), lit: false },
          { label: 'Overdue', value: formatCurrency(meta.overdueValue || 0), lit: Boolean(meta.overdue) },
          { label: 'Promises broken', value: meta.brokenPromises || 0, lit: Boolean(meta.brokenPromises) },
        ].map((tile) => (
          <div key={tile.label} className={`card px-4 py-3 ${tile.lit ? 'ring-1 ring-danger-500/40' : ''}`}>
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
          placeholder="Search reference or invoice number…"
          value={search}
          onChange={narrow(setSearch)}
        />
        <select className="input w-52" value={kind} onChange={narrow(setKind)} aria-label="Kind">
          <option value="">Invoices and advances</option>
          <option value="invoice">Invoices only</option>
          <option value="advance">Advances only</option>
        </select>
      </div>

      {rows === null && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={load} />}

      {rows?.length === 0 && !error && (
        <EmptyState
          title="Nothing owed"
          description="An invoice appears here the moment a consignment leaves the yard, and an advance the moment somebody raises one against an order."
        />
      )}

      {rows?.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Where it stands</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {rows.map((row) => (
                    <tr key={row._id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <Link to={`/payments/${row._id}`} className="font-semibold text-steel-100 hover:text-accent">
                          {row.invoice?.number || row.number}
                        </Link>
                        <p className="text-xs text-steel-500">
                          {row.kind === 'advance' ? 'Advance' : row.number}
                          {row.order?.number ? ` · ${row.order.number}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-steel-200">{row.customer?.name}</p>
                        <p className="text-xs text-steel-500">{row.assignedTo?.name}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-300">
                        {formatCurrency(row.invoice?.value)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-steel-100">
                        {formatCurrency(row.balance)}
                        {/* What has come in, where it is not the whole thing — the number that
                            makes a part-paid row read as progress rather than as a smaller debt
                            somebody typed. */}
                        {row.received > 0 && row.balance > 0 && (
                          <p className="text-xs font-normal text-steel-500">
                            {formatCurrency(row.received)} in
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={row.isOverdue ? 'text-danger-400' : 'text-steel-300'}>
                          {formatDate(row.dueBy)}
                        </span>
                        {/* A broken promise on the row, because it changes the call and a
                            reader scanning this column would otherwise never learn of it. */}
                        {row.promise?.broken && (
                          <p className="text-xs font-semibold text-danger-400">
                            Promised {formatDate(row.promise.date)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge status={row.state}>{STATE_LABELS[row.state] || row.state}</Badge>
                        {row.judgementNote && (
                          <p className="mt-1 max-w-[14rem] truncate text-xs text-warn-400">
                            {row.judgementNote}
                          </p>
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
