import { useState } from 'react';
import { customers, products, salesOrders } from '../api/endpoints.js';
import { useListParams, useOptions, useResource } from '../hooks/useResource.js';
import DataTable from '../components/DataTable.jsx';
import Toolbar from '../components/Toolbar.jsx';
import LineItemsEditor, { emptyLine } from '../components/LineItemsEditor.jsx';
import { Badge, Field, Modal, PageHeader } from '../components/ui.jsx';
import { formatCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUSES = [
  'confirmed',
  'in_production',
  'ready_to_dispatch',
  'partially_dispatched',
  'dispatched',
  'closed',
  'cancelled',
];

/** Percentage of the ordered quantity already shipped. */
const fulfilment = (order) => {
  const ordered = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const shipped = order.lines.reduce((sum, line) => sum + (line.quantityDispatched || 0), 0);
  return ordered ? Math.round((shipped / ordered) * 100) : 0;
};

export default function SalesOrders() {
  const { can } = useAuth();
  const { params, setPage, setFilter } = useListParams({ sort: '-createdAt' });
  const { rows, pagination, isLoading, error, refetch, create, invalidate } = useResource(
    'salesOrders',
    salesOrders,
    params
  );

  const customerOptions = useOptions('customers', customers);
  const productOptions = useOptions('products', products);

  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState(null);
  const [form, setForm] = useState({
    customer: '',
    customerPoNumber: '',
    deliveryDate: '',
    priority: 'normal',
    lines: [emptyLine('product')],
  });
  const [formError, setFormError] = useState(null);

  const canSell = can('sales');
  const canShip = can('sales', 'inventory');
  const canPlan = can('sales', 'production');

  const resetForm = () => {
    setForm({
      customer: '',
      customerPoNumber: '',
      deliveryDate: '',
      priority: 'normal',
      lines: [emptyLine('product')],
    });
    setFormError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError(null);
    try {
      await create.mutateAsync({
        customer: form.customer,
        customerPoNumber: form.customerPoNumber || undefined,
        deliveryDate: form.deliveryDate || undefined,
        priority: form.priority,
        lines: form.lines.map((line) => ({
          product: line.product,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discountPercent: Number(line.discountPercent) || 0,
          taxPercent: Number(line.taxPercent) || 0,
        })),
      });
      setCreating(false);
      resetForm();
    } catch (submitError) {
      setFormError(submitError);
    }
  };

  return (
    <div>
      <PageHeader
        title="Sales orders"
        subtitle="Confirmed orders moving through production and dispatch"
        actions={
          canSell && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              + New order
            </button>
          )
        }
      />

      <Toolbar
        search={params.search || ''}
        onSearchChange={(value) => setFilter('search', value)}
        placeholder="Search order or customer PO…"
        filters={[
          {
            key: 'status',
            label: 'All statuses',
            value: params.status || '',
            onChange: (value) => setFilter('status', value),
            options: STATUSES.map((status) => ({ value: status, label: humanise(status) })),
          },
          {
            key: 'priority',
            label: 'All priorities',
            value: params.priority || '',
            onChange: (value) => setFilter('priority', value),
            options: ['low', 'normal', 'high', 'urgent'].map((priority) => ({
              value: priority,
              label: humanise(priority),
            })),
          },
        ]}
      />

      <DataTable
        columns={[
          {
            key: 'number',
            header: 'Order',
            render: (row) => (
              <div>
                <p className="font-medium text-slate-800">{row.number}</p>
                {row.customerPoNumber && <p className="text-xs text-slate-400">PO {row.customerPoNumber}</p>}
              </div>
            ),
          },
          { key: 'customer', header: 'Customer', render: (row) => row.customer?.name || '—' },
          { key: 'orderDate', header: 'Ordered', render: (row) => formatDate(row.orderDate) },
          { key: 'deliveryDate', header: 'Due', render: (row) => formatDate(row.deliveryDate) },
          {
            key: 'fulfilment',
            header: 'Dispatched',
            render: (row) => {
              const percent = fulfilment(row);
              return (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${percent === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500">{percent}%</span>
                </div>
              );
            },
          },
          {
            key: 'grandTotal',
            header: 'Value',
            className: 'text-right',
            render: (row) => <span className="font-medium">{formatCurrency(row.grandTotal)}</span>,
          },
          { key: 'status', header: 'Status', render: (row) => <Badge status={row.status} /> },
          {
            key: 'actions',
            header: '',
            className: 'text-right whitespace-nowrap',
            render: (row) => {
              if (['cancelled', 'closed'].includes(row.status)) return null;
              return (
                <div className="flex justify-end gap-3">
                  {canPlan && (
                    <button
                      type="button"
                      className="text-sm text-brand-600 hover:underline"
                      onClick={() => setAction({ type: 'plan', order: row })}
                    >
                      Plan
                    </button>
                  )}
                  {canShip && fulfilment(row) < 100 && (
                    <button
                      type="button"
                      className="text-sm text-brand-600 hover:underline"
                      onClick={() => setAction({ type: 'dispatch', order: row })}
                    >
                      Dispatch
                    </button>
                  )}
                  {can('sales', 'accounts') && (
                    <button
                      type="button"
                      className="text-sm text-emerald-600 hover:underline"
                      onClick={() => setAction({ type: 'invoice', order: row })}
                    >
                      Invoice
                    </button>
                  )}
                </div>
              );
            },
          },
        ]}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        pagination={pagination}
        onPageChange={setPage}
        emptyTitle="No sales orders yet"
        emptyDescription="Convert an accepted quotation or raise an order directly."
      />

      <Modal
        open={creating}
        title="New sales order"
        size="lg"
        onClose={() => {
          setCreating(false);
          resetForm();
        }}
      >
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Customer" className="sm:col-span-2">
              <select
                className="input"
                value={form.customer}
                onChange={(event) => setForm({ ...form, customer: event.target.value })}
                required
              >
                <option value="">Select a customer…</option>
                {customerOptions.map((customer) => (
                  <option key={customer._id} value={customer._id}>
                    {customer.code} — {customer.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer PO">
              <input
                className="input"
                value={form.customerPoNumber}
                onChange={(event) => setForm({ ...form, customerPoNumber: event.target.value })}
              />
            </Field>
            <Field label="Delivery date">
              <input
                type="date"
                className="input"
                value={form.deliveryDate}
                onChange={(event) => setForm({ ...form, deliveryDate: event.target.value })}
              />
            </Field>
          </div>

          <LineItemsEditor
            lines={form.lines}
            onChange={(lines) => setForm({ ...form, lines })}
            items={productOptions}
            itemKey="product"
            itemLabel="Hanger"
          />

          {formError && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <p>{formError.message}</p>
              {formError.details?.map((detail) => (
                <p key={detail.field} className="text-xs">
                  {detail.field}: {detail.message}
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setCreating(false);
                resetForm();
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create order'}
            </button>
          </div>
        </form>
      </Modal>

      <OrderActionModal action={action} onClose={() => setAction(null)} onDone={invalidate} />
    </div>
  );
}

/** Handles the three post-order actions: plan production, dispatch and invoice. */
function OrderActionModal({ action, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const order = action?.order;

  const titles = {
    plan: 'Plan production',
    dispatch: 'Dispatch order',
    invoice: 'Raise invoice',
  };

  const descriptions = {
    plan: 'Raises a production order for each line, netting off finished hangers already in stock.',
    dispatch: 'Issues the pending quantity of every line from the finished goods store.',
    invoice: 'Creates a tax invoice for the full order value, due per the customer payment terms.',
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (action.type === 'plan') {
        const data = await salesOrders.planProduction({ id: order._id });
        setResult(
          data.productionOrders.length
            ? `Raised ${data.productionOrders.length} production order(s): ${data.productionOrders
                .map((productionOrder) => productionOrder.number)
                .join(', ')}`
            : 'Every line is already covered by available stock — nothing to produce.'
        );
      } else if (action.type === 'dispatch') {
        const data = await salesOrders.dispatch({ id: order._id });
        setResult(`Order is now ${humanise(data.status).toLowerCase()}.`);
      } else {
        const data = await salesOrders.invoice({ id: order._id });
        setResult(`Invoice ${data.number} raised for ${formatCurrency(data.grandTotal)}.`);
      }
      onDone();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Modal open={Boolean(action)} title={titles[action?.type] || ''} onClose={close} size="sm">
      {order && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-800">{order.number}</p>
            <p className="text-slate-500">
              {order.customer?.name} · {formatCurrency(order.grandTotal)}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {order.lines.map((line, index) => (
                <li key={index}>
                  {line.product?.name || line.product} — {formatNumber(line.quantity)} pcs
                  {line.quantityDispatched ? ` (${formatNumber(line.quantityDispatched)} dispatched)` : ''}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-slate-600">{descriptions[action.type]}</p>

          {result && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{result}</p>}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={close}>
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button type="button" className="btn-primary" onClick={run} disabled={busy}>
                {busy ? 'Working…' : titles[action.type]}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
