import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { Field, FormError } from './ui.jsx';
import { CustomerSelect } from './pickers.jsx';
import EnquiryFields from './EnquiryFields.jsx';
import { SOURCES, buildEnquiryPayload } from '../utils/pipeline.js';

/**
 * Raising an enquiry, or correcting one.
 *
 * Lifted out of the list so the detail page edits through the same form. What a buyer asked for
 * is the thing everything downstream is built on — the sample, the costing, the quotation — and
 * it is taken down from a phone call, so a wrong size or a misheard shade needs correcting in
 * place rather than by raising a second enquiry nobody can tell from the first.
 *
 * The customer is fixed once the enquiry exists: an enquiry pointed at a different buyer is a
 * different enquiry, and the sample already on the bench was requested against this one.
 */

export default function EnquiryForm({ enquiry, onClose, onSaved }) {
  const editing = Boolean(enquiry);
  const requirement = enquiry?.requirement || {};

  const [error, setError] = useState(null);
  const [customer, setCustomer] = useState(
    enquiry?.customer?._id ?? enquiry?.customer ?? undefined
  );
  const [mould, setMould] = useState(enquiry?.mould?._id ?? enquiry?.mould ?? undefined);
  const [isNewDevelopment, setNewDevelopment] = useState(Boolean(enquiry?.isNewDevelopment));
  /* The register picks, held here like the mould: they are controlled selects, not inputs. */
  const [spec, setSpec] = useState(
    editing
      ? {
          materialRef: requirement.materialRef?._id ?? requirement.materialRef ?? undefined,
          hookRef: requirement.hookRef?._id ?? requirement.hookRef ?? undefined,
          clipRef: requirement.clipRef?._id ?? requirement.clipRef ?? undefined,
          printRef: requirement.printRef?._id ?? requirement.printRef ?? undefined,
          colour: requirement.colour || '',
          colourMandatory: Boolean(requirement.colourMandatory),
        }
      : {}
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: editing
      ? {
          source: enquiry.source || 'phone',
          targetPrice: enquiry.targetPrice ?? '',
          estimatedValue: enquiry.estimatedValue ?? '',
          requiredDeliveryDate: enquiry.requiredDeliveryDate
            ? enquiry.requiredDeliveryDate.slice(0, 10)
            : '',
          remarks: enquiry.remarks || '',
          nextAction: enquiry.nextAction || '',
          nextFollowUpDate: enquiry.nextFollowUpDate
            ? enquiry.nextFollowUpDate.slice(0, 10)
            : '',
          requirement: {
            modelNumber: requirement.modelNumber || '',
            category: requirement.category || '',
            sizeMm: requirement.sizeMm ?? '',
            packing: requirement.packing || '',
          },
        }
      : { source: 'phone' },
  });

  const submit = async (values) => {
    setError(null);

    if (!customer) {
      setError({ message: 'Pick the customer this enquiry belongs to.' });
      return;
    }
    if (!mould && !isNewDevelopment && !values.requirement?.modelNumber?.trim()) {
      setError({
        message:
          'Name the mould, or give the model number the buyer asked for, or mark this as a new development.',
      });
      return;
    }

    try {
      const payload = buildEnquiryPayload(values, { mould, isNewDevelopment, spec });

      onSaved(
        editing
          ? /* The customer is not sent: an enquiry pointed at a different buyer is a different
               enquiry, and the sample already on the bench was requested against this one. */
            await enquiriesApi.update({ id: enquiry._id, ...payload })
          : await enquiriesApi.create({ customer, ...payload })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Customer"
          className="sm:col-span-2"
          hint={
            editing
              ? 'Fixed — an enquiry for a different buyer is a different enquiry'
              : 'Not a customer yet? Start it as a lead instead.'
          } required>
          <CustomerSelect
            value={customer}
            onChange={setCustomer}
            disabled={editing}
            aria-label="Customer"
          />
        </Field>
        <Field label="How the enquiry reached us">
          <select className="input" {...register('source')}>
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <EnquiryFields
        register={register}
        errors={errors}
        mould={mould}
        onMouldChange={setMould}
        spec={spec}
        onSpecChange={setSpec}
        newDevelopment={isNewDevelopment}
        onNewDevelopmentChange={setNewDevelopment}
      />

      <FormError error={error} />

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Raise enquiry'}
        </button>
      </div>
    </form>
  );
}
