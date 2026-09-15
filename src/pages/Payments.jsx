import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { payments as paymentsApi } from '../api/endpoints.js';
import { useDebounced } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';
import { SortHeader, useSort } from '../components/SortHeader.jsx';

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
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  /*
   * Which slice of the ledger, held in the address rather than in state.
   *
   * It mostly arrives from somewhere else — the management home's "Overdue money" tile links
   * straight here with `?overdue=true` — and a filter in the URL is also a link somebody can
   * send a colleague. Held in component state instead, that tile would open the whole ledger
   * beside a figure counting a fraction of it, which is what it did until now.
   */
  const only = params.get('overdue') === 'true' ? 'overdue'
    : params.get('broken') === 'true' ? 'broken'
      : params.get('open') === 'true' ? 'open' : '';
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [meta, setMeta] = useState({});
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
      const response = await paymentsApi.list({
        search: term || undefined,
        kind: kind || undefined,
        /* One of the three, or none of them — the server reads whichever is present. */
        open: only === 'open' ? 'true' : undefined,
        overdue: only === 'overdue' ? 'true' : undefined,
        broken: only === 'broken' ? 'true' : undefined,
        sort: sort || undefined,
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
  }, [term, kind, only, sort, page]);

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
        {/*
          The three slices a chase list is actually worked from. All three turn on the balance,
          which is the invoice less the receipts and is worked out rather than stored — so this
          is a filter the server applies to the open set it already has in hand, not a database
          query. Through the address, so the choice survives a reload and can be linked to.
        */}
        <select
          className="input w-52"
          value={only}
          aria-label="Which of the ledger"
          onChange={(event) => {
            const value = event.target.value;
            const next = new URLSearchParams(params);
            for (const key of ['overdue', 'broken', 'open']) next.delete(key);
            if (value) next.set(value, 'true');
            setParams(next, { replace: true });
            setPage(1);
          }}
        >
          <option value="">The whole ledger</option>
          <option value="open">Still owed</option>
          <option value="overdue">Past its date</option>
          <option value="broken">Promise broken</option>
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
                    <SortHeader field="number" label="Reference" sort={sort} onToggle={sortBy} className="px-4" />
                    <th className="px-4 py-3">Customer</th>
                    <SortHeader field="invoice.value" label="Value" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    {/*
                      What is still owed is the invoice less the receipts, summed on the way out
                      of the record — there is nothing stored for the server to rank, so this
                      heading stays plain. Due date is the near-enough proxy, and it is the
                      order this list opens on anyway.
                    */}
                    <th className="px-4 py-3 text-right">Outstanding</th>
                    <SortHeader field="dueBy" label="Due" sort={sort} onToggle={sortBy} className="px-4" />
                    {/* Descending is "who have we already chased hardest and still not been
                        paid", which is a different list from "who is most overdue". */}
                    <SortHeader field="escalationLevel" label="Where it stands" sort={sort} onToggle={sortBy} className="px-4" />
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
