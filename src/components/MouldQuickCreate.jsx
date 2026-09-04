import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { moulds as mouldsApi } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';
import { HANGER_CATEGORIES, HOOK_TYPES, MATERIALS } from '../utils/pipeline.js';

/**
 * Puts a model on the mould register without leaving the form that needed one.
 *
 * Same reasoning as the customer version: searching the master and finding nothing is the
 * moment the record is wanted, and being sent away to add it is where a half-filled request
 * gets abandoned.
 *
 * It asks for more than the customer form does, and more than the product catalogue it
 * replaces did, because the register will not hold a tool it cannot compute from. The part
 * weight and the cycle time are the two figures every derived number on the register comes
 * out of — consumption per piece, output per hour, the machine cost of a piece — and a
 * record created without them is a row that answers none of the questions the register
 * exists for. They are also the two figures the person opening this form actually has: only
 * production and sampling may write here, and both of them are standing near the tool.
 *
 * What it deliberately does not ask for is the rest of the tool room's detail — cavities
 * beyond the default, runner weight, regrind recovery, the press and its hourly rate — nor
 * the commercial half, the minimum and the packing quantity. Those are decisions and
 * measurements rather than details to be guessed at halfway through raising a sample, and a
 * figure invented here is a figure something later costs against. They stay on the mould's
 * own screen, where the person who owns them can set them.
 *
 * The mould code is stamped on the steel and has to be unique, so it is checked before
 * submitting rather than only refused afterwards — and a match is offered to be used, since
 * a second row for a tool that already exists is the failure this is most likely to cause.
 */
export default function MouldQuickCreate({ open, initialName = '', onClose, onCreated }) {
  const [error, setError] = useState(null);
  const [existing, setExisting] = useState(null);

  const blank = { name: initialName, category: 'shirt', material: 'pp', hookType: 'fixed', cavities: 1 };

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: blank });

  useEffect(() => {
    if (open) {
      reset({ name: initialName, category: 'shirt', material: 'pp', hookType: 'fixed', cavities: 1 });
      setError(null);
      setExisting(null);
    }
  }, [open, initialName, reset]);

  /** The mould code is the key. A duplicate is worth catching before the form is submitted. */
  const checkCode = async () => {
    const code = getValues('mouldCode')?.trim();
    if (!code) return setExisting(null);

    try {
      const response = await mouldsApi.list({ search: code, limit: 5 });
      const match = (response.data || []).find(
        (mould) => mould.mouldCode?.toUpperCase() === code.toUpperCase()
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
      const created = await mouldsApi.create({
        mouldCode: values.mouldCode.trim().toUpperCase(),
        name: values.name.trim(),
        category: values.category,
        material: values.material,
        hookType: values.hookType || undefined,
        sizeMm: Number(values.sizeMm),
        cavities: Number(values.cavities) || 1,
        partWeightGrams: Number(values.partWeightGrams),
        cycleTimeSeconds: Number(values.cycleTimeSeconds),
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
          A model is a mould. The weight and cycle below are what every costing off this tool
          is derived from &mdash; the runner, the output per hour, the machine cost of a piece.
          The minimum, the packing and the rest of the tool room&rsquo;s detail are on the
          mould&rsquo;s own screen: they are decisions rather than details, and a figure guessed
          at here is a figure something later prices against.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mould code" error={errors.mouldCode?.message} hint="What is stamped on the tool, e.g. M-102">
            <input
              className="input uppercase"
              placeholder="M-102"
              {...register('mouldCode', {
                required: 'Every tool has its number',
                minLength: { value: 2, message: 'Every tool has its number' },
                onBlur: checkCode,
              })}
            />
          </Field>
          <Field label="Name" error={errors.name?.message}>
            <input
              className="input"
              autoFocus
              placeholder="400mm standard shirt hanger"
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
          <Field label="Material" hint="The resin in the barrel, not the finish">
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
          <Field label="Cavities" error={errors.cavities?.message}>
            <input
              type="number"
              className="input"
              {...register('cavities', { min: { value: 1, message: 'A tool has at least one' } })}
            />
          </Field>
          <Field
            label="Part weight (g)"
            error={errors.partWeightGrams?.message}
            hint="One moulded piece, on a PP basis"
          >
            <input
              type="number"
              step="0.01"
              className="input"
              placeholder="26"
              {...register('partWeightGrams', {
                required: 'A moulded piece has a weight',
                min: { value: 0.01, message: 'A moulded piece has a weight' },
              })}
            />
          </Field>
          <Field label="Cycle (seconds)" error={errors.cycleTimeSeconds?.message} hint="Door close to door close">
            <input
              type="number"
              step="0.1"
              className="input"
              placeholder="28"
              {...register('cycleTimeSeconds', {
                required: 'A cycle takes time',
                min: { value: 0.1, message: 'A cycle takes time' },
              })}
            />
          </Field>
        </div>

        {/* A second row for a tool that already exists is the mess this most likely causes. */}
        {existing && (
          <Notice tone="warn">
            <p>
              {existing.mouldCode} is already on the register as {existing.name}.
            </p>
            <button
              type="button"
              className="mt-1.5 font-semibold underline"
              onClick={() => {
                onCreated(existing);
                onClose();
              }}
            >
              Use {existing.mouldCode} instead
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
