import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { materials as materialsApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { MATERIAL_TYPES } from '../utils/pipeline.js';

/**
 * Adding a resin to the register, or correcting one.
 *
 * Lifted out of the register list so the detail page edits through this same form rather than a
 * second copy of it. Two numbers do the work and they are not the same kind of number: the
 * **rate** is a purchase fact that moves every few weeks, and a costing copies it rather than
 * reading through — so changing it here never re-prices a quotation already sent. The
 * **grammage factor** is physical and almost never moves.
 */

export default function MaterialForm({ material, onClose, onSaved }) {
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
        <p className="mt-0.5 text-xs text-steel-500">
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
