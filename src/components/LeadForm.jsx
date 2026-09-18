import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { leads as leadsApi } from '../api/endpoints.js';
import { Field, FormError } from './ui.jsx';
import OwnerPicker from './OwnerPicker.jsx';
import PlaceInput from './PlaceInput.jsx';
import { SOURCES } from '../utils/pipeline.js';

/**
 * Raising a lead, or correcting one.
 *
 * Lifted out of the list so the detail page edits through the same form. A lead is the record
 * typed in the biggest hurry in the whole system — somebody is on the phone — so it is also the
 * one most often wrong in a small way, and "raise a second one" is not a correction: it is two
 * leads for one company and a follow-up queue that double-counts.
 */

export default function LeadForm({ lead, onClose, onSaved }) {
  const editing = Boolean(lead);
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: lead
      ? {
          company: lead.company || '',
          contactName: lead.contactName || '',
          mobile: lead.mobile || '',
          email: lead.email || '',
          city: lead.city || '',
          state: lead.state || '',
          source: lead.source || 'phone',
          estimatedValue: lead.estimatedValue ?? '',
          productInterest: lead.productInterest || '',
          nextAction: lead.nextAction || '',
          nextFollowUpDate: lead.nextFollowUpDate ? lead.nextFollowUpDate.slice(0, 10) : '',
        }
      : { source: 'phone' },
  });

  // Registered rather than spread onto an input, because the value comes from the suggestion
  // list as well as the keyboard and react-hook-form has to see both.
  const city = watch('city');
  const state = watch('state');

  const submit = async (values) => {
    setError(null);
    const numeric = (value) => (value === '' || value == null ? undefined : Number(value));

    try {
      const payload = {
        ...values,
        email: values.email || undefined,
        estimatedValue: numeric(values.estimatedValue),
        nextFollowUpDate: values.nextFollowUpDate || undefined,
      };

      onSaved(
        editing
          ? await leadsApi.update({ id: lead._id, ...payload })
          : await leadsApi.create(payload)
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" error={errors.company} className="sm:col-span-2" required>
          <input className="input" {...register('company', { required: 'Company is required' })} />
        </Field>
        <Field label="Contact name">
          <input className="input" {...register('contactName')} />
        </Field>
        <Field label="Designation">
          <input className="input" {...register('designation')} />
        </Field>
        <Field label="Mobile">
          <input type="tel" className="input" {...register('mobile')} />
        </Field>
        <Field label="Email" error={errors.email}>
          <input type="email" className="input" {...register('email')} />
        </Field>
        {/* City before state, and choosing a town fills the state in — which is the order
            somebody says an address in, and saves the second field most of the time. */}
        <Field label="City" hint="Pick from the list where you can — one spelling per town keeps the reports honest">
          <PlaceInput
            kind="city"
            aria-label="City"
            placeholder="Tiruppur, Ludhiana, Surat…"
            value={city}
            state={state}
            onChange={(next) => setValue('city', next, { shouldDirty: true })}
            onResolveState={(next) => setValue('state', next, { shouldDirty: true })}
          />
        </Field>
        <Field label="State">
          <PlaceInput
            kind="state"
            aria-label="State"
            placeholder="Tamil Nadu…"
            value={state}
            onChange={(next) => setValue('state', next, { shouldDirty: true })}
          />
        </Field>
        <Field label="How did they reach us">
          <select className="input" {...register('source')}>
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Estimated value (₹)">
          <input type="number" className="input" {...register('estimatedValue')} />
        </Field>

        {/*
          Whose lead it is. Only on create: moving one afterwards is a reassignment, which the
          server treats as a management decision and which this form has never done.
        */}
        {!editing && (
          <OwnerPicker
            register={register}
            watch={watch}
            error={errors.assignedTo}
            load={leadsApi.team}
            label="Who will chase this lead"
          />
        )}
      </div>

      <Field label="What are they after" hint="Free text — a lead rarely names a model yet">
        <textarea rows={2} className="input" {...register('productInterest')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Next action">
          <input className="input" placeholder="Call to confirm sizes" {...register('nextAction')} />
        </Field>
        {/* Not a date already gone — the server refuses one, and a reminder born late lands
            in somebody's morning list looking like neglect on the day it was made. */}
        <Field label="Follow up on">
          <input
            type="date"
            className="input"
            min={new Date().toISOString().slice(0, 10)}
            {...register('nextFollowUpDate')}
          />
        </Field>
      </div>

      <FormError error={error} />

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create lead'}
        </button>
      </div>
    </form>
  );
}
