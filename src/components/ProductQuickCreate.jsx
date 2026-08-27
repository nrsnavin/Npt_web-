import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { products as productsApi } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';
import { HANGER_CATEGORIES, HOOK_TYPES, MATERIALS } from '../utils/pipeline.js';

/**
 * Adds a model to the catalogue without leaving the form that needed one.
 *
 * Same reasoning as the customer version: searching the master and finding nothing is the
 * moment the record is wanted, and being sent away to add it is where a half-filled request
 * gets abandoned.
 *
 * It asks for more than the customer form does because the catalogue demands more — a model
 * is not a model without its category, size and material, and the server refuses without
 * them. What it deliberately does not ask for is the commercial half: standard price, MOQ,
 * packing quantity, mould number. Those are decisions, not details to be guessed at halfway
 * through raising a sample, and a price invented here is a price something later quotes.
 * They stay on the product's own screen, where the person who owns them can set them.
 *
 * The model code is the catalogue's key and has to be unique, so it is checked before
 * submitting rather than only refused afterwards — and a match is offered to be used, since
 * a second row for a model that already exists is the failure this is most likely to cause.
 */
export default function ProductQuickCreate({ open, initialName = '', onClose, onCreated }) {
  const [error, setError] = useState(null);
  const [existing, setExisting] = useState(null);

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { name: initialName, category: 'shirt', material: 'plastic', hookType: 'fixed' },
  });

  useEffect(() => {
    if (open) {
      reset({ name: initialName, category: 'shirt', material: 'plastic', hookType: 'fixed' });
      setError(null);
      setExisting(null);
    }
  }, [open, initialName, reset]);

  /** The model code is the key. A duplicate is worth catching before the form is submitted. */
  const checkCode = async () => {
    const code = getValues('modelCode')?.trim();
    if (!code) return setExisting(null);

    try {
      const response = await productsApi.list({ search: code, limit: 5 });
      const match = (response.data || []).find(
        (product) => product.modelCode?.toUpperCase() === code.toUpperCase()
      );
      return setExisting(match || null);
    } catch {
      // A failed pre-check must never block the form; the server checks again on submit.
      return setExisting(null);
    }
  };

  const submit = async (values) => {
    setError(null);
    try {
      const created = await productsApi.create({
        modelCode: values.modelCode.trim().toUpperCase(),
        name: values.name.trim(),
        category: values.category,
        material: values.material,
        hookType: values.hookType || undefined,
        sizeMm: Number(values.sizeMm),
      });
      onCreated(created);
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <Modal open={open} title="Add a model" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <p className="text-xs leading-relaxed text-steel-500">
          What the model is. Price, MOQ, packing and the mould are on the model&rsquo;s own
          screen &mdash; they are decisions rather than details, and a figure guessed at here
          is a figure something later quotes.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Model code" error={errors.modelCode?.message} hint="The plant's own convention, e.g. NPT-400S">
            <input
              className="input uppercase"
              placeholder="NPT-400S"
              {...register('modelCode', {
                required: 'Every model needs its code',
                minLength: { value: 2, message: 'Every model needs its code' },
                onBlur: checkCode,
              })}
            />
          </Field>
          <Field label="Name" error={errors.name?.message}>
            <input
              className="input"
              autoFocus
              placeholder="400mm Shirt Hanger — Standard"
              {...register('name', {
                required: 'What is it called?',
                minLength: { value: 2, message: 'What is it called?' },
              })}
            />
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
          <Field label="Size (mm)" error={errors.sizeMm?.message}>
            <input
              type="number"
              className="input"
              placeholder="400"
              {...register('sizeMm', {
                required: 'How big is it?',
                min: { value: 1, message: 'How big is it?' },
              })}
            />
          </Field>
          <Field label="Hook">
            <select className="input" {...register('hookType')}>
              {HOOK_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* A second row for a model that already exists is the mess this most likely causes. */}
        {existing && (
          <Notice tone="warn">
            <p>
              {existing.modelCode} is already in the catalogue as {existing.name}.
            </p>
            <button
              type="button"
              className="mt-1.5 font-semibold underline"
              onClick={() => {
                onCreated(existing);
                onClose();
              }}
            >
              Use {existing.modelCode} instead
            </button>
          </Notice>
        )}

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
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Adding…' : 'Add model'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
