import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloads, orders as ordersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { CustomerSelect, MouldSelect } from '../components/pickers.jsx';
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

/** A blank line, so the form starts with one row rather than an empty table. */
const blankLine = () => ({
  mould: '', modelNumber: '', colour: '', quantity: '', unitPrice: '', deliveryDate: '',
});

function OrderForm({ onClose, onSaved }) {
  const [customer, setCustomer] = useState(undefined);
  const [lines, setLines] = useState([blankLine()]);
  const [terms, setTerms] = useState({ paymentTerms: '', gstPercent: 18, remarks: '' });
  const [po, setPo] = useState({ number: '', date: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const setLine = (index, key) => (value) =>
    setLines(lines.map((line, at) => (at === index ? { ...line, [key]: value } : line)));

  /* Never below one: the server refuses an order with nothing on it, and it is right to. */
  const removeLine = (index) =>
    setLines(lines.length === 1 ? lines : lines.filter((unused, at) => at !== index));

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await ordersApi.create({
          customer,
          customerPo: { number: text(po.number), date: text(po.date) },
          gstPercent: numeric(terms.gstPercent),
          paymentTerms: text(terms.paymentTerms),
          remarks: text(terms.remarks),
          lines: lines.map((line) => ({
            mould: line.mould || undefined,
            modelNumber: text(line.modelNumber),
            colour: text(line.colour),
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            deliveryDate: text(line.deliveryDate),
          })),
        })
      );
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Notice tone="info">
        This is the second door. Where a quotation was raised and accepted, book the order from
        the quotation instead &mdash; the models, rates and moulds come across rather than being
        typed again.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer">
          <CustomerSelect value={customer} onChange={setCustomer} aria-label="Customer" />
        </Field>
        <Field label="Their PO number" hint="What the buyer calls this order">
          <input
            className="input"
            placeholder="PO/SCM/2026/4471"
            value={po.number}
            onChange={(event) => setPo({ ...po, number: event.target.value })}
          />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="eyebrow">What was ordered</p>
          <p className="text-xs tabular-nums text-steel-400">{rupees(total)} before tax</p>
        </div>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="rounded-lg border border-line/[0.06] p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={index === 0 ? 'Model' : ''} hint={index === 0 ? 'The mould, or leave empty for a traded piece' : undefined}>
                  <MouldSelect
                    value={line.mould}
                    onChange={setLine(index, 'mould')}
                    aria-label={`Model on line ${index + 1}`}
                  />
                </Field>
                <Field label={index === 0 ? 'Model number' : ''} hint={index === 0 ? "What the buyer calls it" : undefined}>
                  <input
                    className="input"
                    value={line.modelNumber}
                    onChange={(event) => setLine(index, 'modelNumber')(event.target.value)}
                  />
                </Field>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <Field label={index === 0 ? 'Colour' : ''}>
                  <input
                    className="input"
                    value={line.colour}
                    onChange={(event) => setLine(index, 'colour')(event.target.value)}
                  />
                </Field>
                <Field label={index === 0 ? 'Quantity' : ''}>
                  <input
                    type="number"
                    min="1"
                    className="input"
                    value={line.quantity}
                    onChange={(event) => setLine(index, 'quantity')(event.target.value)}
                  />
                </Field>
                <Field label={index === 0 ? 'Rate' : ''}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={line.unitPrice}
                    onChange={(event) => setLine(index, 'unitPrice')(event.target.value)}
                  />
                </Field>
                <Field label={index === 0 ? 'Wanted by' : ''}>
                  <input
                    type="date"
                    className="input"
                    value={line.deliveryDate}
                    onChange={(event) => setLine(index, 'deliveryDate')(event.target.value)}
                  />
                </Field>
              </div>

              {lines.length > 1 && (
                <button
                  type="button"
                  className="mt-2 text-xs text-steel-500 hover:text-danger-400"
                  onClick={() => removeLine(index)}
                >
                  Remove this line
                </button>
              )}
            </div>
          ))}
        </div>

        <button type="button" className="btn-secondary mt-3" onClick={() => setLines([...lines, blankLine()])}>
          + Another model
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment terms">
          <input
            className="input"
            placeholder="45 days from invoice"
            value={terms.paymentTerms}
            onChange={(event) => setTerms({ ...terms, paymentTerms: event.target.value })}
          />
        </Field>
        <Field label="GST %">
          <input
            type="number"
            className="input"
            value={terms.gstPercent}
            onChange={(event) => setTerms({ ...terms, gstPercent: event.target.value })}
          />
        </Field>
      </div>

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !customer}>
          {busy ? 'Booking…' : 'Book the order'}
        </button>
      </div>
    </form>
  );
}

export default function Orders() {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [awaiting, setAwaiting] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const term = useDebounced(search);
  const filters = {
    search: term || undefined,
    status: status || undefined,
    awaitingRelease: awaiting ? 'true' : undefined,
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
        subtitle="What has been committed to, and what §13 still wants before the plant starts"
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
      </div>

      {loading && <TableSkeleton columns={6} />}
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((order) => {
                    const short = order.outstandingChecks?.length || 0;
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
                            <p className="mt-1 text-[0.6875rem] text-warn-400">
                              {short} check{short === 1 ? '' : 's'} short
                            </p>
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
    </div>
  );
}
