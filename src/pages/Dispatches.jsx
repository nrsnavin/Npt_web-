import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dispatches as dispatchApi, downloads } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { DispatchDialog } from '../components/DispatchForm.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { DISPATCH_STAGES, dispatchStageLabel } from '../utils/pipeline.js';

/**
 * Despatch's screen [BLUEPRINT §18–19], which answers two different questions and so has two
 * halves.
 *
 * **What can go out today** is the first, and it is the one nobody had an answer to before. One
 * row per order line: what production packed, what other consignments are already holding, and
 * what is left. Sorted by the date somebody promised a buyer, because that is what decides what
 * goes on this afternoon's lorry — an order-number sort would be a list nobody can work from.
 *
 * **What is already moving** is the second: the consignments themselves, with the paperwork on
 * the row. A despatch clerk asked "where is the Bangalore load" needs the LR and the vehicle,
 * not a link to a detail page.
 *
 * The tabs are deliberate rather than two pages. They are the same job an hour apart, and
 * splitting them across the navigation would mean nobody notices the free stock accumulating
 * while they work through the loads already raised.
 */

const TABS = [
  { key: 'ready', label: 'Ready to send' },
  { key: 'moving', label: 'Consignments' },
];

/* ------------------------------ What can go out ------------------------------ */

function ReadyQueue({ mayWrite }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);
  /** The order a consignment is being raised against, with the stock of every line on it. */
  const [raising, setRaising] = useState(null);

  const term = useDebounced(search);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await dispatchApi.ready({ search: term || undefined, page, limit: 25 });
      setRows(response.data);
      setPagination(response.pagination);
      setMeta(response.meta || {});
    } catch (loadError) {
      setError(loadError);
      setRows([]);
    }
  }, [term, page]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Everything free on the same order, so the dialog can offer the whole lorry at once.
   *
   * A consignment raised from one row would be one model per lorry, which is not how anything
   * ships. The rows are already in hand, so this is a filter rather than a fetch.
   */
  const raiseFor = (row) =>
    setRaising({
      order: row.order,
      stock: rows.filter((entry) => String(entry.order._id) === String(row.order._id)),
    });

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Lines with stock', value: formatNumber(meta.lines || 0) },
          { label: 'Free to send', value: formatNumber(meta.available || 0), lit: true },
          { label: 'Held on a consignment', value: formatNumber(meta.reserved || 0) },
        ].map((tile) => (
          <div key={tile.label} className="card px-4 py-3">
            <p className="eyebrow">{tile.label}</p>
            <p className={`stat-value mt-1 ${tile.lit ? 'text-flame-400' : 'text-steel-50'}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      <input
        type="search"
        className="input mb-5 max-w-xs"
        placeholder="Search order, model or customer…"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />

      {rows === null && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={load} />}

      {rows?.length === 0 && !error && (
        <EmptyState
          title="Nothing packed and waiting"
          description="Material appears here as production records it, and you are sent a task the moment it does."
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
                    <th className="px-4 py-3 text-right">Packed</th>
                    <th className="px-4 py-3 text-right">Held</th>
                    <th className="px-4 py-3 text-right">Gone</th>
                    <th className="px-4 py-3 text-right">Free</th>
                    <th className="px-4 py-3">Wanted by</th>
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {rows.map((row) => (
                    <tr key={String(row.orderLine)} className="row-hover">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-steel-100">{row.modelNumber || '—'}</p>
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
                        {formatNumber(row.readyQty)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-warn-400">
                        {row.reserved ? formatNumber(row.reserved) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-400">
                        {row.dispatched ? formatNumber(row.dispatched) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-flame-400">
                        {formatNumber(row.available)}
                      </td>
                      <td className="px-4 py-3.5 text-steel-300">
                        {row.deliveryDate ? formatDate(row.deliveryDate) : '—'}
                      </td>
                      {mayWrite && (
                        <td className="px-4 py-3.5">
                          <button type="button" className="row-action" onClick={() => raiseFor(row)}>
                            Send
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

      <DispatchDialog
        order={raising?.order}
        stock={raising?.stock}
        open={Boolean(raising)}
        onClose={() => setRaising(null)}
        onRaised={() => {
          setRaising(null);
          load();
        }}
      />
    </>
  );
}

/* ------------------------------ What is moving ------------------------------ */

function Consignments() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [only, setOnly] = useState('open');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [meta, setMeta] = useState({});
  const [error, setError] = useState(null);

  const term = useDebounced(search);
  const filters = {
    search: term || undefined,
    status: status || undefined,
    open: only === 'open' ? 'true' : undefined,
    inTransit: only === 'transit' ? 'true' : undefined,
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await dispatchApi.list({ ...filters, page, limit: 25 });
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

  const narrow = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Open consignments', value: formatNumber(meta.open || 0), lit: false },
          { label: 'On the road', value: formatNumber(meta.inTransit || 0), lit: false },
          { label: 'Past their delivery date', value: formatNumber(meta.overdue || 0), lit: Boolean(meta.overdue) },
        ].map((tile) => (
          <div
            key={tile.label}
            className={`card px-4 py-3 ${tile.lit ? 'ring-1 ring-danger-500/40' : ''}`}
          >
            <p className="eyebrow">{tile.label}</p>
            <p className={`stat-value mt-1 ${tile.lit ? 'text-danger-400' : 'text-steel-50'}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search consignment, invoice, LR or vehicle…"
          value={search}
          onChange={narrow(setSearch)}
        />
        <select className="input w-52" value={status} onChange={narrow(setStatus)} aria-label="Stage">
          <option value="">All stages</option>
          {DISPATCH_STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>{stage.label}</option>
          ))}
        </select>
        <select className="input w-44" value={only} onChange={narrow(setOnly)} aria-label="Narrow to">
          <option value="open">Everything open</option>
          <option value="transit">On the road</option>
          <option value="">Including closed</option>
        </select>
        <ExportButton download={downloads.dispatches} params={filters} />
      </div>

      {rows === null && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={load} />}

      {rows?.length === 0 && !error && (
        <EmptyState
          title="No consignments"
          description="Raise one from Ready to send, against material the plant has already packed."
        />
      )}

      {rows?.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Consignment</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3 text-right">Pieces</th>
                    <th className="px-4 py-3">Going to</th>
                    <th className="px-4 py-3">Paperwork</th>
                    <th className="px-4 py-3">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {rows.map((row) => (
                    <tr key={row._id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <Link to={`/dispatches/${row._id}`} className="font-semibold text-steel-100 hover:text-accent">
                          {row.number}
                        </Link>
                        <p className="text-xs text-steel-500">
                          {row.lineCount} model{row.lineCount === 1 ? '' : 's'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <Link to={`/orders/${row.order?._id}`} className="text-steel-300 hover:text-accent">
                          {row.order?.number}
                        </Link>
                        <p className="text-xs text-steel-500">{row.customer?.name}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                        {formatNumber(row.dispatchQty)}
                      </td>
                      <td className="px-4 py-3.5 text-steel-300">
                        {row.destination?.city || row.destination?.address || '—'}
                        {row.expectedDeliveryDate && (
                          <p className={`text-xs ${row.isOverdue ? 'text-danger-400' : 'text-steel-500'}`}>
                            {row.isOverdue ? 'Was due ' : 'Due '}
                            {formatDate(row.expectedDeliveryDate)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-steel-400">
                        {/*
                          The three facts a clerk asked "where is the Bangalore load" needs, on
                          the row. Sending them to a detail page for an LR number is the phone
                          call this module exists to remove.
                        */}
                        {row.invoice?.number || row.lrNumber || row.vehicleNumber ? (
                          <>
                            {row.invoice?.number && <p>{row.invoice.number}</p>}
                            {row.lrNumber && <p>LR {row.lrNumber}</p>}
                            {row.vehicleNumber && <p className="text-steel-500">{row.vehicleNumber}</p>}
                          </>
                        ) : (
                          <span className="text-warn-400">Nothing yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge status={row.status}>{dispatchStageLabel(row.status)}</Badge>
                        {row.dispatchDate && (
                          <p className="mt-1 text-[0.6875rem] text-steel-500">
                            Left {formatDate(row.dispatchDate)}
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
    </>
  );
}

/* --------------------------------- The page --------------------------------- */

export default function Dispatches() {
  const { canWrite } = useAuth();
  const [tab, setTab] = useState('ready');

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dispatch"
        subtitle="What is packed and free to send, and what is already on the road"
      />

      <div className="mb-5 flex gap-1 border-b border-line/[0.08]">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              tab === entry.key
                ? 'border-accent text-steel-50'
                : 'border-transparent text-steel-400 hover:text-steel-200'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'ready' ? <ReadyQueue mayWrite={canWrite('dispatch')} /> : <Consignments />}
    </div>
  );
}
