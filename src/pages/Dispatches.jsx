import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dispatches as dispatchApi, downloads } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced } from '../hooks/useRecords.js';
import {
  EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { DispatchStatusPicker } from '../components/DispatchStatus.jsx';
import { DispatchDialog } from '../components/DispatchForm.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import FilterTiles from '../components/FilterTiles.jsx';
import { DISPATCH_STAGES } from '../utils/pipeline.js';

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
  const { sort, toggle } = useSort();

  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };

  const term = useDebounced(search);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await dispatchApi.ready({
        search: term || undefined,
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
  }, [term, sort, page]);

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
                    {/*
                      Every column here is sortable, which is unusual in this app and worth a
                      word. These rows are built line by line on the server rather than read out
                      of a collection, so the figures are plain numbers on the row by the time
                      anything sorts them — none of the "computed on the way out" problem that
                      keeps arrows off the consignment table next door.

                      "Free, biggest first" is the one that earns its keep: it is how a clerk
                      fills a lorry that would otherwise go out half empty.
                    */}
                    <SortHeader field="modelNumber" label="Model" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="order.number" label="Order" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="readyQty" label="Packed" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    <SortHeader field="reserved" label="Held" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    <SortHeader field="dispatched" label="Gone" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    <SortHeader field="available" label="Free" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    <SortHeader field="deliveryDate" label="Wanted by" sort={sort} onToggle={sortBy} className="px-4" />
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {rows.map((row) => (
                    <tr key={String(row.orderLine)} className="row-hover">
                      {/* `whitespace-nowrap`: these are identifiers, and a column of "NPT-" over
                          "400S" is one nobody can scan. */}
                      <td className="px-4 py-3.5">
                        <p className="whitespace-nowrap font-semibold text-steel-100">{row.modelNumber || '—'}</p>
                        <p className="whitespace-nowrap text-xs text-steel-400">
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
                      {/*
                        The date the buyer is owed, which is the re-agreed one where marketing has
                        recorded one. Said so on the row, because a date here that does not match
                        the purchase order in somebody's hand is a figure they will ring to query.
                      */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-steel-300">
                        {row.deliveryDate ? formatDate(row.deliveryDate) : '—'}
                        {row.promisedDate && row.poDeliveryDate && (
                          <p className="text-xs text-steel-500">
                            re-agreed from {formatDate(row.poDeliveryDate)}
                          </p>
                        )}
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

function Consignments({ mayWrite }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [only, setOnly] = useState('open');
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
  const filters = {
    search: term || undefined,
    status: status || undefined,
    open: only === 'open' ? 'true' : undefined,
    inTransit: only === 'transit' ? 'true' : undefined,
    /* A real query rather than a count: a consignment's due date is two stored fields with a
       precedence between them, so "late" is expressible — see the note on the controller. */
    overdue: only === 'overdue' ? 'true' : undefined,
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await dispatchApi.list({ ...filters, sort: sort || undefined, page, limit: 25 });
      setRows(response.data);
      setPagination(response.pagination);
      setMeta(response.meta || {});
    } catch (loadError) {
      setError(loadError);
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, status, only, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  const narrow = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <>
      {/* The three figures the board opens on, made into the way to look at them. */}
      <FilterTiles
        value={only}
        onPick={(next) => {
          setOnly(next);
          setPage(1);
        }}
        tiles={[
          {
            label: 'Open consignments',
            figure: formatNumber(meta.open || 0),
            value: 'open',
            clear: '',
            hint: 'Anything not yet delivered or closed',
          },
          {
            label: 'On the road',
            figure: formatNumber(meta.inTransit || 0),
            value: 'transit',
            clear: 'open',
            hint: 'Gone, and not yet acknowledged',
          },
          {
            label: 'Past their delivery date',
            figure: formatNumber(meta.overdue || 0),
            value: 'overdue',
            clear: 'open',
            lit: Boolean(meta.overdue),
            hint: 'Past the date the buyer was given',
          },
        ]}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search consignment, invoice, lorry receipt or vehicle…"
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
          <option value="overdue">Past their date</option>
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
                    <SortHeader field="number" label="Consignment" sort={sort} onToggle={sortBy} className="px-4" />
                    <th className="px-4 py-3">Order</th>
                    {/* Summed over the lines on the way out, so there is nothing stored to
                        rank — the server refuses the key rather than draw an arrow that lies. */}
                    <th className="px-4 py-3 text-right">Pieces</th>
                    <SortHeader field="destination.city" label="Going to" sort={sort} onToggle={sortBy} className="px-4" />
                    {/* The ordering §19 is about: the day somebody gave a buyer. */}
                    {/*
                      Plain, and that is the honest answer rather than an oversight.

                      The cell now draws `dueDate` — the promise where there is one, the estimate
                      otherwise — which is a **virtual**: the record stores the two dates and
                      chooses between them on the way out, so Mongo has nothing to rank. Offering
                      a sort arrow here would draw a control that returns an error, which reads
                      as the software being broken rather than as the column being unsortable.

                      It used to offer `expectedDeliveryDate`, which did sort — and ranked the
                      list by a date the cell had stopped showing. The "Past their delivery date"
                      tile above is the reliable way to ask this question.
                    */}
                    <th className="px-4 py-3">Wanted by</th>
                    <th className="px-4 py-3">Paperwork</th>
                    <SortHeader field="status" label="Stage" sort={sort} onToggle={sortBy} className="px-4" />
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
                      </td>
                      {/* The promised date has a column of its own now rather than sitting
                          under the destination, so a board can be ranked by it — which is the
                          ordering despatch actually works from. */}
                      {/*
                        The date this row is actually judged against, which is what the model
                        calls `dueDate`: the promise to the buyer when marketing has recorded
                        one, the plant's own estimate otherwise.

                        It used to draw `expectedDeliveryDate` and colour it by `isOverdue` —
                        and `isOverdue` is measured against the promise. So a consignment
                        promised for the 30th with an estimate of the 20th showed "20 Sept" with
                        no warning on the 25th, because it was not late against the promise: a
                        date five days gone and nothing flagged, which reads as the badge being
                        broken. The tile above counted a third thing again.

                        Whose date it is now says so, because "the buyer was told this" and "we
                        think this" are different facts to act on.
                      */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs">
                        {row.dueDate ? (
                          <span className={row.isOverdue ? 'font-semibold text-danger-400' : 'text-steel-300'}>
                            {formatDate(row.dueDate)}
                            {row.isOverdue && <p className="text-danger-400">Past its date</p>}
                            <p className="font-normal text-steel-500">
                              {row.dueDateIsPromise ? 'promised to the buyer' : 'our estimate'}
                            </p>
                            {/* Both, when they differ — a clerk reading the row should not have
                                to open the record to find the estimate the promise replaced. */}
                            {row.dueDateIsPromise && row.expectedDeliveryDate &&
                              formatDate(row.expectedDeliveryDate) !== formatDate(row.dueDate) && (
                                <p className="font-normal text-steel-600">
                                  est. {formatDate(row.expectedDeliveryDate)}
                                </p>
                              )}
                          </span>
                        ) : (
                          <span className="text-steel-600">&mdash;</span>
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
                        {/* The badge is the control: it offers what the server says can be
                            done from here, and nothing it cannot. */}
                        <DispatchStatusPicker
                          dispatch={row}
                          canAct={mayWrite}
                          onDone={load}
                        />
                        {row.dispatchDate && (
                          <p className="mt-1 text-xs text-steel-500">
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

      {tab === 'ready'
        ? <ReadyQueue mayWrite={canWrite('dispatch')} />
        : <Consignments mayWrite={canWrite('dispatch')} />}
    </div>
  );
}
