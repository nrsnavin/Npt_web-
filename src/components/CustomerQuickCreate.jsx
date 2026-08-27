import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { customers as customersApi } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';
import { CUSTOMER_TYPES } from '../utils/pipeline.js';

/**
 * Adds a customer without leaving the form that needed one.
 *
 * Searching the master and finding nobody is the moment the record is wanted. Sending the
 * user to the customers screen and back is where a half-filled sample request gets abandoned
 * — or worse, where the buyer's name ends up typed into a remarks box, which is how a CRM
 * quietly stops being the place customers live.
 *
 * Deliberately the short form: a name, how to reach them, and the GST number if it is to
 * hand. Everything else on a customer — credit terms, rating, addresses, contacts — is for
 * the person setting the account up properly, not for someone halfway through raising a
 * sample. The full screen stays where it is.
 *
 * The duplicate rules are the same ones the customers screen runs, checked before submitting
 * and enforced again by the server. Quick creation is exactly how a master fills with three
 * spellings of the same firm, so the answer to "they already exist" is to offer that record
 * rather than to explain the refusal.
 */
export default function CustomerQuickCreate({ open, initialName = '', onClose, onCreated }) {
  const [error, setError] = useState(null);
  const [duplicate, setDuplicate] = useState(null);

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { name: initialName, customerType: 'garment_factory' } });

  // The name typed into the search box is the answer to "what are they called".
  useEffect(() => {
    if (open) {
      reset({ name: initialName, customerType: 'garment_factory' });
      setError(null);
      setDuplicate(null);
    }
  }, [open, initialName, reset]);

  const checkForDuplicate = async () => {
    const { gstin, mobile } = getValues();
    if (!gstin && !mobile) return;
    try {
      const result = await customersApi.checkDuplicate({ gstin, mobile });
      setDuplicate(result.duplicate ? result : null);
    } catch {
      // A failed pre-check must never block the form; the server checks again on submit.
      setDuplicate(null);
    }
  };

  const submit = async (values) => {
    setError(null);
    try {
      const created = await customersApi.create({
        name: values.name.trim(),
        customerType: values.customerType || undefined,
        mobile: values.mobile?.trim() || undefined,
        email: values.email?.trim() || undefined,
        gstin: values.gstin?.trim() || undefined,
        city: values.city?.trim() || undefined,
      });
      onCreated(created);
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <Modal open={open} title="Add a customer" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <p className="text-xs leading-relaxed text-steel-500">
          The short version, so you can carry on. Credit terms, contacts and addresses are on
          the customer&rsquo;s own screen whenever someone gets to them.
        </p>

        <Field label="Name" error={errors.name?.message}>
          <input
            className="input"
            autoFocus
            placeholder="Trendline Apparels"
            {...register('name', {
              required: 'Who are they?',
              minLength: { value: 2, message: 'Who are they?' },
            })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select className="input" {...register('customerType')}>
              {CUSTOMER_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="City">
            <input className="input" placeholder="Tiruppur" {...register('city')} />
          </Field>
          <Field label="Mobile" hint="Any common local format">
            <input className="input" placeholder="98765 43210" {...register('mobile', { onBlur: checkForDuplicate })} />
          </Field>
          <Field label="GST number">
            <input className="input" placeholder="33AABCS1429B1ZP" {...register('gstin', { onBlur: checkForDuplicate })} />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <input className="input" type="email" placeholder="buyer@firm.com" {...register('email')} />
          </Field>
        </div>

        {/*
          When the match is one the caller may see, offer it — picking the existing record is
          what they actually wanted. When it belongs to a colleague the server withholds it,
          so the warning names who to talk to rather than handing over a record they have no
          right to; offering a button that cannot work would be worse than saying nothing.
        */}
        {duplicate && (
          <Notice tone="warn">
            {duplicate.customer ? (
              <>
                <p>
                  {duplicate.customer.name} ({duplicate.customer.code}) already exists with the
                  same {duplicate.matchedOn}.
                </p>
                <button
                  type="button"
                  className="mt-1.5 font-semibold underline"
                  onClick={() => {
                    onCreated({
                      _id: duplicate.customer.id,
                      name: duplicate.customer.name,
                      code: duplicate.customer.code,
                    });
                    onClose();
                  }}
                >
                  Use {duplicate.customer.name} instead
                </button>
              </>
            ) : (
              <p>
                A customer with the same {duplicate.matchedOn} already exists
                {duplicate.owner ? `, and belongs to ${duplicate.owner}` : ''}. Speak to them
                rather than creating a second record.
              </p>
            )}
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
            {isSubmitting ? 'Adding…' : 'Add customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
