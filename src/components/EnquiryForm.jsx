import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { Field, FormError } from './ui.jsx';
import { CustomerSelect } from './pickers.jsx';
import EnquiryFields from './EnquiryFields.jsx';
import ItemRows, { itemsForSave } from './ItemRows.jsx';
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
  /*
   * The other things the buyer asked about, beyond the first.
   *
   * Held from index 1 rather than including the primary, because the primary is the block
   * below — with the mould and the new-development tick on it — and having the same item in two
   * places on one form is how the two come to disagree while somebody is typing. The payload
   * builder puts them back together.
   */
  const [extras, setExtras] = useState(() => (enquiry?.items || []).slice(1).map((item) => ({
    modelNumber: item.modelNumber || '',
    category: item.category || '',
    sizeMm: item.sizeMm ?? '',
    materialRef: item.materialRef?._id ?? item.materialRef ?? '',
    colour: item.colour || '',
    hookRef: item.hookRef?._id ?? item.hookRef ?? '',
    clipRef: item.clipRef?._id ?? item.clipRef ?? '',
    printRef: item.printRef?._id ?? item.printRef ?? '',
    printing: item.printing || '',
    packing: item.packing || '',
  })));

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
      const payload = buildEnquiryPayload(values, {
        mould, isNewDevelopment, spec, extraItems: itemsForSave(extras),
      });

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

      {/* Below the first item, because that is the order the conversation went in and the one
          the record keeps: the first thing they asked about is what a sample is raised for. */}
      <ItemRows items={extras} onChange={setExtras} disabled={isSubmitting} />

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
