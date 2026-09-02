import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { downloads, materials as materialsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { formatDate } from '../utils/format.js';
import { MATERIAL_TYPES, optionLabel } from '../utils/pipeline.js';

/**
 * The material register.
 *
 * Two numbers do the work here and they are not the same kind of number. The **rate** is a
 * purchase fact that moves every few weeks, and a costing copies it rather than reading through
 * — so changing it here never re-prices a quotation somebody already sent. The **grammage
 * factor** is a physical one that almost never moves: a cavity is a fixed volume, so a denser
 * resin makes a heavier part out of the same tool, and the plant works to HIPS being PP plus
 * 18%. A mould's grammage is recorded on a PP basis, which is why PP and LD sit at zero.
 */

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/** A rate nobody has confirmed in a season is not wrong, but it is worth a second look. */
const STALE_DAYS = 90;
const isStale = (at) =>
  at ? (Date.now() - new Date(at).getTime()) / 86400000 > STALE_DAYS : false;

function MaterialForm({ material, onClose, onSaved }) {
  const [error, setError] = useState(null);
  const editing = Boolean(material);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: editing
      ? { ...material }
      : { type: 'pp', grammageFactorPercent: 0, isActive: true },
  });

  const watched = watch();
  const number = (value) =>
    value === '' || value === null || value === undefined ? undefined : Number(value);

  const submit = async (values) => {
    setError(null);
    const payload = {
      name: values.name,
      type: values.type,
      colour: values.colour || undefined,
      ratePerKg: number(values.ratePerKg),
      grammageFactorPercent: number(values.grammageFactorPercent) ?? 0,
      supplier: values.supplier || undefined,
      isActive: values.isActive,
      notes: values.notes || undefined,
    };

    try {
      onSaved(
        editing
          ? await materialsApi.update({
              id: material._id,
              expectedUpdatedAt: material.updatedAt,
              ...payload,
            })
          : await materialsApi.create({ ...payload, code: values.code || undefined })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  const factor = Number(watched.grammageFactorPercent) || 0;

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={errors.name} hint="What the store calls it">
          <input className="input" placeholder="HIPS Natural" {...register('name', { required: 'A name is required' })} />
        </Field>
        <Field label="Code" hint={editing ? 'Fixed — costings point at it' : 'Optional, e.g. HIPS-NAT'}>
          <input
            className="input uppercase"
            disabled={editing}
            defaultValue={material?.code}
            {...(editing ? {} : register('code'))}
          />
        </Field>
        <Field label="Polymer">
          <select className="input" {...register('type')}>
            {MATERIAL_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Colour" hint="The same resin at a different rate">
          <input className="input" placeholder="Natural" {...register('colour')} />
        </Field>
        <Field label="Rate (₹ per kg)" error={errors.ratePerKg}>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            {...register('ratePerKg', { required: 'A material has a rate' })}
          />
        </Field>
        {/*
          The physical number, and the one that is easy to get wrong by hand. Zero for the resins
          a mould's grammage is recorded in; 18 for HIPS, which is the plant's own figure.
        */}
        <Field
          label="Grammage over PP (%)"
          hint="0 for PP and LD · 18 for HIPS"
        >
          <input type="number" step="0.1" className="input" {...register('grammageFactorPercent')} />
        </Field>
        <Field label="Supplier">
          <input className="input" {...register('supplier')} />
        </Field>
      </div>

      {/* Said in grams rather than in percent, because grams is what a costing shows. */}
      <div className="card px-4 py-3">
        <p className="eyebrow">What a 30 g PP part weighs in this material</p>
        <p className="stat-value mt-1 text-steel-50">
          {(30 * (1 + factor / 100)).toFixed(2)} g
        </p>
        <p className="mt-0.5 text-[0.6875rem] text-steel-500">
          {factor === 0
            ? 'The same, because a mould records its grammage on this basis'
            : `${factor > 0 ? '+' : ''}${factor}% out of the same cavity`}
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-steel-200">
        <input type="checkbox" className="h-4 w-4 accent-flame-500" {...register('isActive')} />
        Still bought
      </label>

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
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add the material'}
        </button>
      </div>
    </form>
  );
}

export default function Materials() {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const term = useDebounced(search);
  const filters = { search: term || undefined, type: type || undefined };
  const { data, pagination, loading, error, reload } = useRecordList(materialsApi.list, {
    ...filters,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('materials');

  const onFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Material register"
        subtitle="Every resin the plant buys, at the rate a costing reads"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.materials} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setEditing({})}>
                + New material
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search name, code, colour or supplier…"
          value={search}
          onChange={onFilterChange(setSearch)}
        />
        <select className="input w-44" value={type} onChange={onFilterChange(setType)} aria-label="Polymer">
          <option value="">All polymers</option>
          {MATERIAL_TYPES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No materials match"
          description="Try a different search, or add the resin to the register."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Material</th>
                    <th className="px-4 py-3">Polymer</th>
                    <th className="px-4 py-3">Colour</th>
                    <th className="px-4 py-3 text-right">Rate / kg</th>
                    <th className="px-4 py-3 text-right">Grammage</th>
                    <th className="px-4 py-3">Confirmed</th>
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((material) => (
                    <tr key={material._id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-steel-100">{material.name}</p>
                        {material.code && (
                          <p className="text-xs text-steel-400">{material.code}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-steel-200">
                        {optionLabel(MATERIAL_TYPES, material.type)}
                      </td>
                      <td className="px-4 py-3.5 text-steel-300">{material.colour || '—'}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-100">
                        {rupees(material.ratePerKg)}
                      </td>
                      {/*
                        Lit only when it is not zero. A column of "0%" teaches nothing; the one
                        resin that changes the weight is the one worth catching the eye.
                      */}
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {material.grammageFactorPercent ? (
                          <span className="font-semibold text-flame-400">
                            +{material.grammageFactorPercent}%
                          </span>
                        ) : (
                          <span className="text-steel-500">as PP</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-xs ${
                            isStale(material.rateUpdatedAt) ? 'text-warn-400' : 'text-steel-400'
                          }`}
                        >
                          {material.rateUpdatedAt ? formatDate(material.rateUpdatedAt) : '—'}
                        </span>
                        {material.isActive === false && <Badge status="inactive" />}
                      </td>
                      {mayWrite && (
                        <td className="px-4 py-3.5 text-right">
                          <button type="button" className="row-action" onClick={() => setEditing(material)}>
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
        title={editing?._id ? editing.name : 'New material'}
        description="A costing copies the rate, so changing it here never re-prices a quote already sent"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <MaterialForm
            material={editing._id ? editing : null}
            onClose={() => setEditing(null)}
            onSaved={reload}
          />
        )}
      </Modal>
    </div>
  );
}
