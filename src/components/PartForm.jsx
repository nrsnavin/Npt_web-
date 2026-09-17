import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { components as componentsApi } from '../api/endpoints.js';
import { Field, FormError } from './ui.jsx';

/**
 * Adding a hook, clip or print job to its register, or correcting one.
 *
 * One form for three registers, because they are the same register with a different noun on it —
 * same fields, same rules, same people keeping them. Lifted out of the list page so the detail
 * pages edit through it too.
 *
 * Everything here is priced **per piece**, which is what separates these from the material
 * register beside them: resin is bought by the kilo and needs a grammage conversion, a hook is a
 * hook. The unit is stated on every rate for exactly that reason.
 */

/** The noun each register puts on the same shape. Exported, so the list says the same words. */

export const KINDS = {
  hook: {
    title: 'Hook register',
    subtitle: 'Every hook the plant fits, at the rate a costing reads',
    one: 'hook',
    placeholder: 'Swivel metal hook',
    codeHint: 'e.g. HK-SWV',
  },
  clip: {
    title: 'Clip register',
    subtitle: 'Every clip the plant fits, at the rate a costing reads',
    one: 'clip',
    placeholder: 'Metal clip pair',
    codeHint: 'e.g. CL-MTL',
  },
  print: {
    title: 'Print register',
    subtitle: 'What a printed piece is charged at, by job',
    one: 'print job',
    placeholder: '1 colour screen',
    codeHint: 'e.g. PR-1C',
  },
};

export default function PartForm({ kind, part, onClose, onSaved }) {
  const [error, setError] = useState(null);
  const editing = Boolean(part);
  const copy = KINDS[kind];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: editing ? { ...part } : { isActive: true } });

  const number = (value) =>
    value === '' || value === null || value === undefined ? undefined : Number(value);

  const submit = async (values) => {
    setError(null);
    const payload = {
      name: values.name,
      colour: values.colour || undefined,
      ratePerPiece: number(values.ratePerPiece),
      supplier: values.supplier || undefined,
      isActive: values.isActive,
      notes: values.notes || undefined,
    };

    try {
      onSaved(
        editing
          ? await componentsApi.update({
              id: part._id,
              expectedUpdatedAt: part.updatedAt,
              ...payload,
            })
          : await componentsApi.create({ ...payload, kind, code: values.code || undefined })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={errors.name}>
          <input
            className="input"
            placeholder={copy.placeholder}
            {...register('name', { required: 'A name is required' })}
          />
        </Field>
        {/*
          Unique within this register only — a hook and a clip may both be STD-01 in their own
          stores, and refusing the second would be a rule nobody could see from here.
        */}
        <Field label="Code" hint={editing ? 'Fixed — costings point at it' : copy.codeHint}>
          <input
            className="input uppercase"
            disabled={editing}
            defaultValue={part?.code}
            {...(editing ? {} : register('code'))}
          />
        </Field>
        <Field label="Colour" hint="Where it changes the rate">
          <input className="input" {...register('colour')} />
        </Field>
        {/* The unit is in the label, not implied by the column it sits under. */}
        <Field label="Rate (₹ per piece)" error={errors.ratePerPiece}>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            {...register('ratePerPiece', { required: 'A rate per piece is required' })}
          />
        </Field>
        <Field label="Supplier">
          <input className="input" {...register('supplier')} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-steel-200">
        <input type="checkbox" className="h-4 w-4 accent-flame-500" {...register('isActive')} />
        Still used
      </label>

      <Field label="Notes">
        <textarea rows={2} className="input" {...register('notes')} />
      </Field>

      <FormError error={error} />

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : `Add the ${copy.one}`}
        </button>
      </div>
    </form>
  );
}
