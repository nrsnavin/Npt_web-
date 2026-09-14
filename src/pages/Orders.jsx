import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloads, orders as ordersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import OrderForm from '../components/OrderForm.jsx';
import { PriorityForm, PRIORITY_TONE, isRaised, priorityLabel } from '../components/OrderPriority.jsx';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';
import { ORDER_STAGES, orderStageLabel, numeric, text } from '../utils/pipeline.js';

/**
 * Sales orders [BLUEPRINT §12–13].
 *
 * The list leads with the two things somebody scanning it needs: how far each order has got,
 * and — before release — how much of §13's checklist is done. That second column is the whole
 * reason this screen is not just a table of orders: an order sitting at "verifying" for a week
 * is invisible unless the screen says it is three checks short.
 *
 * Raising one by hand is the second door and the rarer one. The ordinary route is from an
 * accepted quotation, which retypes nothing — there is a button for it on the quotation itself,
 * and the notice at the top of this form says so rather than leaving somebody to type a
 * quotation's worth of lines again.
 */

const rupees = (value) => (value === undefined || value === null ? '—' : formatCurrency(value));

/**
 * A blank line, so the form starts with one row rather than an empty table.
 *
 * Every field that names a *thing* is a register pick rather than a box [§28]: the tool, the
 * resin, the hook, the clip and the print. What is typed is what belongs to this order and
 * nowhere else — how many, at what rate, by when, and the buyer's own model number.
 */

/**
 * Who may ask the plant to move this job: the marketing person who owns it, or management.
 *
 * Not everybody who can read the order — the plant can read every order, and a flag the plant
 * can set is a flag that stops meaning "the customer asked". The same rule the order's own page
 * draws, and the server enforces it either way; this only decides whether to offer a control
 * that would be refused. Per row rather than per screen, because it turns on who owns the order.
 */
const mayRaiseFor = (order, user) =>
  String(order.assignedTo?._id ?? order.assignedTo) === String(user?.id) ||
  user?.role === 'admin' ||
  user?.department === 'management';

export default function Orders() {
  const { canWrite, user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [awaiting, setAwaiting] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  /* Which order's priority is being set, if any. Held here rather than per row so only one
     dialog can ever be open. */
  const [prioritising, setPrioritising] = useState(null);
  const [urgentOnly, setUrgentOnly] = useState(false);

  const term = useDebounced(search);
  const filters = {
    search: term || undefined,
    status: status || undefined,
    awaitingRelease: awaiting ? 'true' : undefined,
    priority: urgentOnly ? 'raised' : undefined,
  };
  const { data, pagination, loading, error, reload } = useRecordList(ordersApi.list, {
    ...filters,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('orders');

  const onFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Sales orders"
        subtitle="What has been committed to, and what is still to be checked before the plant starts"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.orders} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                + Book an order
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search order number, PO number or model…"
          value={search}
          onChange={onFilterChange(setSearch)}
        />
        <select className="input w-48" value={status} onChange={onFilterChange(setStatus)} aria-label="Stage">
          <option value="">All stages</option>
          {ORDER_STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>{stage.label}</option>
          ))}
        </select>
        {/*
          The gate's own queue. Not a stage filter dressed up as one: "what is waiting on me"
          is the question order confirmation opens this screen to ask, and it spans three of
          §12's stages rather than sitting on any single one.
        */}
        <label className="flex items-center gap-2 text-sm text-steel-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-flame-500"
            checked={awaiting}
            onChange={(event) => {
              setAwaiting(event.target.checked);
              setPage(1);
            }}
          />
          Waiting on verification
        </label>

        {/* The other question this register gets asked, and could not answer: what have we told
            the plant to pull forward? */}
        <label className="flex items-center gap-2 text-sm text-steel-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-flame-500"
            checked={urgentOnly}
            onChange={(event) => {
              setUrgentOnly(event.target.checked);
              setPage(1);
            }}
          />
          Marked urgent
        </label>
      </div>

      {loading && <TableSkeleton columns={7} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data?.length ? (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Models</th>
                    <th className="px-4 py-3 text-right">Pieces</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((order) => {
                    const short = order.outstandingChecks?.length || 0;
                    const mayRaise = mayRaiseFor(order, user);
                    return (
                      <tr key={order._id} className="row-hover">
                        <td className="px-4 py-3.5">
                          <Link to={`/orders/${order._id}`} className="font-semibold text-steel-100 hover:text-accent">
                            {order.number}
                          </Link>
                          <p className="text-xs text-steel-400">
                            {order.customerPo?.number || formatDate(order.orderDate)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-steel-300">{order.customer?.name}</td>
                        <td className="px-4 py-3.5 text-xs text-steel-300">
                          {order.lineCount === 1
                            ? order.lines[0].modelNumber || order.lines[0].mould?.mouldCode
                            : `${order.lineCount} models`}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                          {formatNumber(order.orderedQty)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                          {/* Blank rather than ₹0 for a reader who may not see it — see the API. */}
                          {order.valueHidden ? <span className="text-steel-600">&mdash;</span> : rupees(order.netValue)}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge status={order.status}>{orderStageLabel(order.status)}</Badge>
                          {/*
                            The figure this screen exists to surface. An order sitting at
                            "verifying" for a week says nothing; "3 checks short" says what is
                            actually holding it.
                          */}
                          {short > 0 && order.isOpen && (
                            <p className="mt-1 text-xs text-warn-400">
                              {short} check{short === 1 ? '' : 's'} short
                            </p>
                          )}
                        </td>

                        {/*
                          What the plant has been asked for, on the register rather than only on
                          the order's own page. Both directions of that mattered: a flag nobody
                          can see from the list is a flag nobody audits — this is the column that
                          makes an over-used one obvious — and setting it meant opening an order,
                          so triaging a morning's worth was five round trips.
                        */}
                        <td className="px-4 py-3.5">
                          {isRaised(order) ? (
                            <>
                              <p className={`text-xs font-bold ${PRIORITY_TONE[order.priority]}`}>
                                {priorityLabel(order.priority)}
                              </p>
                              {/* Who asked. The same reason it is on the order page: it is what
                                  makes an over-used flag something anybody can notice. */}
                              {order.priorityBy?.name && (
                                <p className="text-xs text-steel-500">{order.priorityBy.name}</p>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-steel-600">Normal</span>
                          )}
                          {mayRaise && order.isOpen && (
                            <button
                              type="button"
                              className="row-action mt-0.5 block text-xs"
                              onClick={() => setPrioritising(order)}
                            >
                              {isRaised(order) ? 'Change' : 'Mark urgent'}
                            </button>
                          )}
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
      ) : (
        <EmptyState
          title="No orders yet"
          description="An accepted quotation becomes an order from the quotation screen, which retypes nothing."
        />
      ))}

      <Modal
        open={creating}
        title="Book a sales order"
        description="A purchase order that did not come through a quotation"
        size="lg"
        onClose={() => setCreating(false)}
      >
        <OrderForm onClose={() => setCreating(false)} onSaved={reload} />
      </Modal>

      {/*
        The same form the order's own page uses, so the reason box — which is the whole feature —
        cannot soften in one place and not the other.
      */}
      <Modal
        open={Boolean(prioritising)}
        title={`Priority for ${prioritising?.number || ''}`}
        description="What you are asking the plant to move, and what it costs whoever is already on the press"
        onClose={() => setPrioritising(null)}
      >
        {prioritising && (
          <PriorityForm
            order={prioritising}
            onClose={() => setPrioritising(null)}
            onSaved={reload}
          />
        )}
      </Modal>
    </div>
  );
}
