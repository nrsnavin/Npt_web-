import { useState } from 'react';
import { productionOrders, products } from '../api/endpoints.js';
import { useListParams, useOptions, useResource } from '../hooks/useResource.js';
import DataTable from '../components/DataTable.jsx';
import Toolbar from '../components/Toolbar.jsx';
import { Badge, Field, Modal, PageHeader } from '../components/ui.jsx';
import { formatDate, formatNumber, humanise } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUSES = ['planned', 'released', 'in_progress', 'completed', 'cancelled'];

export default function Production() {
  const { can } = useAuth();
  const { params, setPage, setFilter } = useListParams({ sort: '-createdAt' });
  const { rows, pagination, isLoading, error, refetch, create, invalidate } = useResource(
    'productionOrders',
    productionOrders,
    params
  );

  const productOptions = useOptions('products', products);

  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState(null);
  const [form, setForm] = useState({
    product: '',
    quantityPlanned: '',
    machine: '',
    shift: 'A',
    plannedStart: '',
    plannedEnd: '',
  });
  const [formError, setFormError] = useState(null);

  const canRun = can('production');
  const canIssue = can('production', 'inventory');

  const submit = async (event) => {
    event.preventDefault();
    setFormError(null);
    try {
      await create.mutateAsync({
        product: form.product,
        quantityPlanned: Number(form.quantityPlanned),
        machine: form.machine || undefined,
        shift: form.shift,
        plannedStart: form.plannedStart || undefined,
        plannedEnd: form.plannedEnd || undefined,
      });
      setCreating(false);
      setForm({ product: '', quantityPlanned: '', machine: '', shift: 'A', plannedStart: '', plannedEnd: '' });
    } catch (submitError) {
      setFormError(submitError);
    }
  };

  return (
    <div>
      <PageHeader
        title="Production"
        subtitle="Moulding and assembly orders on the shop floor"
        actions={
          canRun && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              + New production order
            </button>
          )
        }
      />

      <Toolbar
        search={params.search || ''}
        onSearchChange={(value) => setFilter('search', value)}
        placeholder="Search order number or machine…"
        filters={[
          {
            key: 'status',
            label: 'All statuses',
            value: params.status || '',
            onChange: (value) => setFilter('status', value),
            options: STATUSES.map((status) => ({ value: status, label: humanise(status) })),
          },
          {
            key: 'shift',
            label: 'All shifts',
            value: params.shift || '',
            onChange: (value) => setFilter('shift', value),
            options: ['A', 'B', 'C'].map((shift) => ({ value: shift, label: `Shift ${shift}` })),
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
                <p className="font-medium text-steel-50">{row.number}</p>
                {row.salesOrder && <p className="text-xs text-steel-500">for {row.salesOrder.number}</p>}
              </div>
            ),
          },
          {
            key: 'product',
            header: 'Hanger',
            render: (row) => (
              <div>
                <p className="text-steel-50">{row.product?.name || '—'}</p>
                <p className="text-xs text-steel-500">{row.product?.sku}</p>
              </div>
            ),
          },
          {
            key: 'progress',
            header: 'Output',
            render: (row) => {
              const percent = row.quantityPlanned
                ? Math.round((row.quantityProduced / row.quantityPlanned) * 100)
                : 0;
              return (
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className={`h-full rounded-full ${percent === 100 ? 'bg-success-500/100' : 'bg-warn-500/100'}`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-steel-400">{percent}%</span>
                  </div>
                  <p className="mt-0.5 text-xs text-steel-500">
                    {formatNumber(row.quantityProduced)} / {formatNumber(row.quantityPlanned)} pcs
                    {row.quantityScrapped > 0 && ` · ${formatNumber(row.quantityScrapped)} scrap`}
                  </p>
                </div>
              );
            },
          },
          {
            key: 'machine',
            header: 'Machine',
            render: (row) => (
              <div className="text-xs">
                <p>{row.machine || '—'}</p>
                <p className="text-steel-500">Shift {row.shift}</p>
              </div>
            ),
          },
          { key: 'plannedEnd', header: 'Due', render: (row) => formatDate(row.plannedEnd) },
          {
            key: 'materialsIssued',
            header: 'Materials',
            render: (row) =>
              row.materialsIssued ? (
                <Badge status="completed">Issued</Badge>
              ) : (
                <Badge status="planned">Pending</Badge>
              ),
          },
          { key: 'status', header: 'Status', render: (row) => <Badge status={row.status} /> },
          {
            key: 'actions',
            header: '',
            className: 'text-right whitespace-nowrap',
            render: (row) => {
              if (['completed', 'cancelled'].includes(row.status)) return null;
              return (
                <div className="flex justify-end gap-3">
                  {canIssue && !row.materialsIssued && row.materials?.length > 0 && (
                    <button
                      type="button"
                      className="row-action"
                      onClick={() => setAction({ type: 'issue', order: row })}
                    >
                      Issue materials
                    </button>
                  )}
                  {canRun && (
                    <button
                      type="button"
                      className="row-action"
                      onClick={() => setAction({ type: 'output', order: row })}
                    >
                      Record output
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
        emptyTitle="Nothing in production"
        emptyDescription="Plan production from a sales order, or raise an order to build stock."
      />

      <Modal open={creating} title="New production order" onClose={() => setCreating(false)}>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-steel-400">
            The active bill of materials for the chosen hanger is exploded automatically into the material
            requirement list.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hanger" className="sm:col-span-2">
              <select
                className="input"
                value={form.product}
                onChange={(event) => setForm({ ...form, product: event.target.value })}
                required
              >
                <option value="">Select a hanger…</option>
                {productOptions.map((product) => (
                  <option key={product._id} value={product._id}>
                    {product.sku} — {product.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity to produce">
              <input
                type="number"
                min="1"
                className="input"
                value={form.quantityPlanned}
                onChange={(event) => setForm({ ...form, quantityPlanned: event.target.value })}
                required
              />
            </Field>
            <Field label="Shift">
              <select
                className="input"
                value={form.shift}
                onChange={(event) => setForm({ ...form, shift: event.target.value })}
              >
                {['A', 'B', 'C'].map((shift) => (
                  <option key={shift} value={shift}>
                    Shift {shift}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Machine">
              <input
                className="input"
                placeholder="e.g. Injection Press 150T"
                value={form.machine}
                onChange={(event) => setForm({ ...form, machine: event.target.value })}
              />
            </Field>
            <Field label="Planned start">
              <input
                type="date"
                className="input"
                value={form.plannedStart}
                onChange={(event) => setForm({ ...form, plannedStart: event.target.value })}
              />
            </Field>
            <Field label="Planned finish">
              <input
                type="date"
                className="input"
                value={form.plannedEnd}
                onChange={(event) => setForm({ ...form, plannedEnd: event.target.value })}
              />
            </Field>
          </div>

          {formError && (
            <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">{formError.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create order'}
            </button>
          </div>
        </form>
      </Modal>

      <ProductionActionModal action={action} onClose={() => setAction(null)} onDone={invalidate} />
    </div>
  );
}

function ProductionActionModal({ action, onClose, onDone }) {
  const [output, setOutput] = useState({ quantityProduced: '', quantityScrapped: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const order = action?.order;
  const isIssue = action?.type === 'issue';

  const close = () => {
    setOutput({ quantityProduced: '', quantityScrapped: '' });
    setResult(null);
    setError(null);
    onClose();
  };

  const run = async (event) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isIssue) {
        await productionOrders.issueMaterials({ id: order._id });
        setResult('Materials issued from the raw material store.');
      } else {
        const data = await productionOrders.recordOutput({
          id: order._id,
          quantityProduced: Number(output.quantityProduced) || 0,
          quantityScrapped: Number(output.quantityScrapped) || 0,
        });
        setResult(
          `Recorded. Order is now ${humanise(data.status).toLowerCase()} at ${formatNumber(
            data.quantityProduced
          )} of ${formatNumber(data.quantityPlanned)} pcs.`
        );
      }
      onDone();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const remaining = order ? order.quantityPlanned - order.quantityProduced : 0;

  return (
    <Modal
      open={Boolean(action)}
      title={isIssue ? 'Issue materials' : 'Record output'}
      onClose={close}
      size="sm"
    >
      {order && (
        <form onSubmit={run} className="space-y-4">
          <div className="rounded-lg bg-white/[0.04] p-3 text-sm">
            <p className="font-medium text-steel-50">{order.number}</p>
            <p className="text-steel-400">{order.product?.name}</p>
          </div>

          {isIssue ? (
            <div>
              <p className="mb-2 text-sm text-steel-300">
                Consumes the following from the raw material store, including the BOM scrap allowance:
              </p>
              <ul className="space-y-1 rounded-lg border border-white/[0.06] p-3 text-sm">
                {order.materials.map((material, index) => (
                  <li key={index} className="flex justify-between">
                    <span className="text-steel-200">{material.material?.name || 'Material'}</span>
                    <span className="font-medium">
                      {material.quantityRequired.toFixed(3)} {material.uom}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Good output (pcs)" hint={`${formatNumber(remaining)} remaining`}>
                <input
                  type="number"
                  min="0"
                  max={remaining}
                  className="input"
                  value={output.quantityProduced}
                  onChange={(event) => setOutput({ ...output, quantityProduced: event.target.value })}
                />
              </Field>
              <Field label="Scrap (pcs)">
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={output.quantityScrapped}
                  onChange={(event) => setOutput({ ...output, quantityScrapped: event.target.value })}
                />
              </Field>
            </div>
          )}

          {result && <p className="rounded-lg bg-success-500/10 px-3 py-2 text-sm text-success-400">{result}</p>}
          {error && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={close}>
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Working…' : isIssue ? 'Issue materials' : 'Record output'}
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
