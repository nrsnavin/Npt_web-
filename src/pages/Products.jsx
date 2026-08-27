import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { downloads, products as productsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { formatCurrency, formatNumber } from '../utils/format.js';
import { HANGER_CATEGORIES, HOOK_TYPES, MATERIALS, optionLabel } from '../utils/pipeline.js';

/** Colours are stored as an array but typed as a list — commas are how people write them. */
const parseColours = (value) =>
  String(value || '')
    .split(',')
    .map((colour) => colour.trim())
    .filter(Boolean);

function ProductForm({ product, onClose, onSaved }) {
  const [error, setError] = useState(null);
  const editing = Boolean(product);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: editing
      ? { ...product, availableColours: (product.availableColours || []).join(', ') }
      : { category: 'shirt', material: 'plastic', hookType: 'fixed', mouldAvailable: false, isActive: true },
  });

  const submit = async (values) => {
    setError(null);

    // Empty number inputs arrive as '' and would fail the schema; drop them instead.
    const numeric = (value) => (value === '' || value === null || value === undefined ? undefined : Number(value));
    const payload = {
      ...values,
      availableColours: parseColours(values.availableColours),
      sizeMm: numeric(values.sizeMm),
      standardWeightGrams: numeric(values.standardWeightGrams),
      standardPrice: numeric(values.standardPrice),
      moq: numeric(values.moq),
      packingQty: numeric(values.packingQty),
      mouldNumber: values.mouldNumber || undefined,
      notes: values.notes || undefined,
    };

    try {
      onSaved(
        editing
          // The version this form was opened on — the catalogue is shared, so two people
          // correcting the same model at once is ordinary rather than unlucky.
          ? await productsApi.update({ id: product._id, expectedUpdatedAt: product.updatedAt, ...payload })
          : await productsApi.create(payload)
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model code" error={errors.modelCode} hint={editing ? undefined : 'e.g. NPT-400S'}>
          <input className="input uppercase" {...register('modelCode', { required: 'Model code is required' })} />
        </Field>
        <Field label="Name" error={errors.name}>
          <input className="input" {...register('name', { required: 'Name is required' })} />
        </Field>
        <Field label="Category">
          <select className="input" {...register('category')}>
            {HANGER_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Material">
          <select className="input" {...register('material')}>
            {MATERIALS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Size (mm)" error={errors.sizeMm}>
          <input type="number" className="input" {...register('sizeMm', { required: 'Size is required' })} />
        </Field>
        <Field label="Weight (g)">
          <input type="number" step="0.1" className="input" {...register('standardWeightGrams')} />
        </Field>
        <Field label="Hook type">
          <select className="input" {...register('hookType')}>
            {HOOK_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Colours" hint="Comma separated">
          <input className="input" placeholder="White, Black, Navy" {...register('availableColours')} />
        </Field>
        <Field label="Standard price (₹)">
          <input type="number" step="0.01" className="input" {...register('standardPrice')} />
        </Field>
        <Field label="Minimum order quantity">
          <input type="number" className="input" {...register('moq')} />
        </Field>
        <Field label="Packing quantity" hint="Pieces per carton">
          <input type="number" className="input" {...register('packingQty')} />
        </Field>
        <Field label="Mould number" hint="Leave blank if no mould of our own">
          <input className="input" {...register('mouldNumber')} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm text-steel-200">
          <input type="checkbox" className="h-4 w-4 accent-flame-500" {...register('mouldAvailable')} />
          Mould available
        </label>
        <label className="flex items-center gap-2 text-sm text-steel-200">
          <input type="checkbox" className="h-4 w-4 accent-flame-500" {...register('isActive')} />
          Active in the catalogue
        </label>
      </div>

      <Field label="Notes">
        <textarea rows={2} className="input" {...register('notes')} />
      </Field>

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add model'}
        </button>
      </div>
    </form>
  );
}

export default function Products() {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [material, setMaterial] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const term = useDebounced(search);
  // One object for both the list and the export, so the file is exactly what is on screen.
  const filters = {
    search: term || undefined,
    category: category || undefined,
    material: material || undefined,
  };
  const { data, pagination, loading, error, reload } = useRecordList(productsApi.list, {
    ...filters,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('products');

  const onFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Product master"
        subtitle="Every hanger model marketing can quote against"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.products} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setEditing({})}>
                + New model
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search model code, name or mould…"
          value={search}
          onChange={onFilterChange(setSearch)}
        />
        <select className="input w-40" value={category} onChange={onFilterChange(setCategory)} aria-label="Category">
          <option value="">All categories</option>
          {HANGER_CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="input w-40" value={material} onChange={onFilterChange(setMaterial)} aria-label="Material">
          <option value="">All materials</option>
          {MATERIALS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No models match"
          description="Try a different search, or add the model to the catalogue."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Model</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3 text-right">Size</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">MOQ</th>
                    <th className="px-4 py-3">Mould</th>
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((product) => (
                    <tr key={product._id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-steel-100">{product.modelCode}</p>
                        <p className="text-xs text-steel-400">{product.name}</p>
                      </td>
                      <td className="px-4 py-3.5 text-steel-200">
                        {optionLabel(HANGER_CATEGORIES, product.category)}
                      </td>
                      <td className="px-4 py-3.5 text-steel-200">
                        {optionLabel(MATERIALS, product.material)}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                        {product.sizeMm} mm
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-100">
                        {product.standardPrice ? formatCurrency(product.standardPrice) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-300">
                        {product.moq ? formatNumber(product.moq) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        {product.mouldAvailable ? (
                          <span className="text-xs text-steel-300">{product.mouldNumber || 'Available'}</span>
                        ) : (
                          <Badge tone="neutral">Bought out</Badge>
                        )}
                        {!product.isActive && <Badge status="inactive" />}
                      </td>
                      {mayWrite && (
                        <td className="px-4 py-3.5 text-right">
                          <button type="button" className="row-action" onClick={() => setEditing(product)}>
                            Edit
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
      ))}

      <Modal
        open={Boolean(editing)}
        title={editing?._id ? `Edit ${editing.modelCode}` : 'New model'}
        description="Model codes are unique and cannot be reused"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <ProductForm
            product={editing._id ? editing : null}
            onClose={() => setEditing(null)}
            onSaved={reload}
          />
        )}
      </Modal>
    </div>
  );
}
