import { useState } from 'react';
import { customers, products, quotations } from '../api/endpoints.js';
import { useListParams, useOptions, useResource } from '../hooks/useResource.js';
import DataTable from '../components/DataTable.jsx';
import Toolbar from '../components/Toolbar.jsx';
import LineItemsEditor, { emptyLine } from '../components/LineItemsEditor.jsx';
import { Badge, Field, Modal, PageHeader } from '../components/ui.jsx';
import { formatCurrency, formatDate, humanise } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'];

export default function Quotations() {
  const { can } = useAuth();
  const { params, setPage, setFilter } = useListParams({ sort: '-createdAt' });
  const { rows, pagination, isLoading, error, refetch, create, invalidate } = useResource(
    'quotations',
    quotations,
    params
  );

  const customerOptions = useOptions('customers', customers);
  const productOptions = useOptions('products', products);

  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState(null);
  const [form, setForm] = useState({ customer: '', validUntil: '', terms: '', lines: [emptyLine('product')] });
  const [formError, setFormError] = useState(null);
  const canWrite = can('sales');

  const resetForm = () => {
    setForm({ customer: '', validUntil: '', terms: '', lines: [emptyLine('product')] });
    setFormError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError(null);
    try {
      await create.mutateAsync({
        customer: form.customer,
        validUntil: form.validUntil || undefined,
        terms: form.terms || undefined,
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
        title="Quotations"
        subtitle="Price offers sent to buyers, ready to convert into orders"
        actions={
          canWrite && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              + New quotation
            </button>
          )
        }
      />

      <Toolbar
        search={params.search || ''}
        onSearchChange={(value) => setFilter('search', value)}
        placeholder="Search quotation number…"
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
          { key: 'number', header: 'Number', render: (row) => <span className="font-medium">{row.number}</span> },
          { key: 'customer', header: 'Customer', render: (row) => row.customer?.name || '—' },
          { key: 'quotationDate', header: 'Date', render: (row) => formatDate(row.quotationDate) },
          { key: 'validUntil', header: 'Valid until', render: (row) => formatDate(row.validUntil) },
          { key: 'lines', header: 'Lines', className: 'text-right', render: (row) => row.lines?.length ?? 0 },
          {
            key: 'grandTotal',
            header: 'Total',
            className: 'text-right',
            render: (row) => <span className="font-medium">{formatCurrency(row.grandTotal)}</span>,
          },
          { key: 'status', header: 'Status', render: (row) => <Badge status={row.status} /> },
          {
            key: 'actions',
            header: '',
            className: 'text-right whitespace-nowrap',
            render: (row) =>
              canWrite && !row.salesOrder && !['rejected', 'expired'].includes(row.status) ? (
                <button
                  type="button"
                  className="row-action"
                  onClick={() => setConverting(row)}
                >
                  Convert to order
                </button>
              ) : row.salesOrder ? (
                <span className="text-xs text-steel-500">Order raised</span>
              ) : null,
          },
        ]}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        pagination={pagination}
        onPageChange={setPage}
        emptyTitle="No quotations yet"
        emptyDescription="Send your first price offer to a buyer."
      />

      <Modal
        open={creating}
        title="New quotation"
        size="lg"
        onClose={() => {
          setCreating(false);
          resetForm();
        }}
      >
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
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
            <Field label="Valid until">
              <input
                type="date"
                className="input"
                value={form.validUntil}
                onChange={(event) => setForm({ ...form, validUntil: event.target.value })}
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

          <Field label="Terms and conditions">
            <textarea
              rows={2}
              className="input"
              value={form.terms}
              onChange={(event) => setForm({ ...form, terms: event.target.value })}
              placeholder="e.g. 50% advance, balance against delivery. Prices ex-works."
            />
          </Field>

          {formError && (
            <div className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">
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
              {create.isPending ? 'Saving…' : 'Create quotation'}
            </button>
          </div>
        </form>
      </Modal>

      <ConvertModal quotation={converting} onClose={() => setConverting(null)} onDone={invalidate} />
    </div>
  );
}

function ConvertModal({ quotation, onClose, onDone }) {
  const [values, setValues] = useState({ customerPoNumber: '', deliveryDate: '', priority: 'normal' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await quotations.convert({
        id: quotation._id,
        customerPoNumber: values.customerPoNumber || undefined,
        deliveryDate: values.deliveryDate || undefined,
        priority: values.priority,
      });
      onDone();
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(quotation)} title="Convert to sales order" onClose={onClose} size="sm">
      {quotation && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-steel-400">
            Raises a sales order from <span className="font-medium text-steel-200">{quotation.number}</span> worth{' '}
            {formatCurrency(quotation.grandTotal)}, carrying the quoted prices across.
          </p>
          <Field label="Customer PO number">
            <input
              className="input"
              value={values.customerPoNumber}
              onChange={(event) => setValues({ ...values, customerPoNumber: event.target.value })}
            />
          </Field>
          <Field label="Delivery date">
            <input
              type="date"
              className="input"
              value={values.deliveryDate}
              onChange={(event) => setValues({ ...values, deliveryDate: event.target.value })}
            />
          </Field>
          <Field label="Priority">
            <select
              className="input"
              value={values.priority}
              onChange={(event) => setValues({ ...values, priority: event.target.value })}
            >
              {['low', 'normal', 'high', 'urgent'].map((priority) => (
                <option key={priority} value={priority}>
                  {humanise(priority)}
                </option>
              ))}
            </select>
          </Field>

          {error && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Converting…' : 'Create sales order'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
