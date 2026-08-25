import { useState } from 'react';
import { materials, purchaseOrders, suppliers, warehouses } from '../api/endpoints.js';
import { useListParams, useOptions, useResource } from '../hooks/useResource.js';
import DataTable from '../components/DataTable.jsx';
import Toolbar from '../components/Toolbar.jsx';
import LineItemsEditor, { emptyLine } from '../components/LineItemsEditor.jsx';
import { Badge, Field, Modal, PageHeader } from '../components/ui.jsx';
import { formatCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUSES = ['draft', 'sent', 'partially_received', 'received', 'cancelled'];

export default function PurchaseOrders() {
  const { can } = useAuth();
  const { params, setPage, setFilter } = useListParams({ sort: '-createdAt' });
  const { rows, pagination, isLoading, error, refetch, create, invalidate } = useResource(
    'purchaseOrders',
    purchaseOrders,
    params
  );

  const supplierOptions = useOptions('suppliers', suppliers);
  const materialOptions = useOptions('materials', materials);
  const warehouseOptions = useOptions('warehouses', warehouses);

  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [form, setForm] = useState({
    supplier: '',
    expectedDate: '',
    warehouse: '',
    status: 'draft',
    lines: [emptyLine('material')],
  });
  const [formError, setFormError] = useState(null);

  const canBuy = can('inventory', 'accounts');

  const resetForm = () => {
    setForm({ supplier: '', expectedDate: '', warehouse: '', status: 'draft', lines: [emptyLine('material')] });
    setFormError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError(null);
    try {
      await create.mutateAsync({
        supplier: form.supplier,
        expectedDate: form.expectedDate || undefined,
        warehouse: form.warehouse || undefined,
        status: form.status,
        lines: form.lines.map((line) => ({
          material: line.material,
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
        title="Purchase orders"
        subtitle="Buying resin, wire, wood and packaging"
        actions={
          canBuy && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              + New purchase order
            </button>
          )
        }
      />

      <Toolbar
        search={params.search || ''}
        onSearchChange={(value) => setFilter('search', value)}
        placeholder="Search PO number…"
        filters={[
          {
            key: 'status',
            label: 'All statuses',
            value: params.status || '',
            onChange: (value) => setFilter('status', value),
            options: STATUSES.map((status) => ({ value: status, label: humanise(status) })),
          },
        ]}
      />

      <DataTable
        columns={[
          { key: 'number', header: 'PO', render: (row) => <span className="font-medium">{row.number}</span> },
          { key: 'supplier', header: 'Supplier', render: (row) => row.supplier?.name || '—' },
          { key: 'orderDate', header: 'Raised', render: (row) => formatDate(row.orderDate) },
          { key: 'expectedDate', header: 'Expected', render: (row) => formatDate(row.expectedDate) },
          {
            key: 'received',
            header: 'Received',
            render: (row) => {
              const ordered = row.lines.reduce((sum, line) => sum + line.quantity, 0);
              const received = row.lines.reduce((sum, line) => sum + (line.quantityReceived || 0), 0);
              const percent = ordered ? Math.round((received / ordered) * 100) : 0;
              return <span className="text-xs text-slate-600">{percent}%</span>;
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
            render: (row) =>
              can('inventory') && !['received', 'cancelled'].includes(row.status) ? (
                <button
                  type="button"
                  className="text-sm text-emerald-600 hover:underline"
                  onClick={() => setReceiving(row)}
                >
                  Receive
                </button>
              ) : null,
          },
        ]}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        pagination={pagination}
        onPageChange={setPage}
        emptyTitle="No purchase orders yet"
        emptyDescription="Raise a PO to replenish raw material stock."
      />

      <Modal
        open={creating}
        title="New purchase order"
        size="lg"
        onClose={() => {
          setCreating(false);
          resetForm();
        }}
      >
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Supplier" className="sm:col-span-2">
              <select
                className="input"
                value={form.supplier}
                onChange={(event) => setForm({ ...form, supplier: event.target.value })}
                required
              >
                <option value="">Select a supplier…</option>
                {supplierOptions.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>
                    {supplier.code} — {supplier.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expected date">
              <input
                type="date"
                className="input"
                value={form.expectedDate}
                onChange={(event) => setForm({ ...form, expectedDate: event.target.value })}
              />
            </Field>
            <Field label="Receive into">
              <select
                className="input"
                value={form.warehouse}
                onChange={(event) => setForm({ ...form, warehouse: event.target.value })}
              >
                <option value="">Default raw store</option>
                {warehouseOptions
                  .filter((warehouse) => warehouse.type === 'raw_material')
                  .map((warehouse) => (
                    <option key={warehouse._id} value={warehouse._id}>
                      {warehouse.code} — {warehouse.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>

          <LineItemsEditor
            lines={form.lines}
            onChange={(lines) => setForm({ ...form, lines })}
            items={materialOptions}
            itemKey="material"
            itemLabel="Material"
            priceField="standardCost"
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
              {create.isPending ? 'Saving…' : 'Create purchase order'}
            </button>
          </div>
        </form>
      </Modal>

      <ReceiveModal order={receiving} onClose={() => setReceiving(null)} onDone={invalidate} />
    </div>
  );
}

function ReceiveModal({ order, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const close = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await purchaseOrders.receive({ id: order._id });
      setResult(`Received. The purchase order is now ${humanise(data.status).toLowerCase()}.`);
      onDone();
    } catch (receiveError) {
      setError(receiveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(order)} title="Receive material" onClose={close} size="sm">
      {order && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Books the pending quantity of every line into the raw material store at the PO rate, updating the
            weighted average cost.
          </p>

          <ul className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm">
            {order.lines.map((line, index) => {
              const pending = line.quantity - (line.quantityReceived || 0);
              return (
                <li key={index} className="flex justify-between">
                  <span className="text-slate-700">{line.material?.name || 'Material'}</span>
                  <span className={pending > 0 ? 'font-medium' : 'text-slate-400'}>
                    {formatNumber(pending)} {line.material?.uom || ''} pending
                  </span>
                </li>
              );
            })}
          </ul>

          {result && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{result}</p>}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={close}>
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button type="button" className="btn-primary" onClick={run} disabled={busy}>
                {busy ? 'Receiving…' : 'Receive all pending'}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
