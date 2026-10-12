import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { Field, FormError } from './ui.jsx';
import { CustomerSelect } from './pickers.jsx';
import EnquiryFields from './EnquiryFields.jsx';
import { filledItem, itemsForSave } from './ItemCards.jsx';
import { SOURCES, buildEnquiryPayload, itemsForEdit } from '../utils/pipeline.js';

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
 *
 * Somebody who is not a customer yet is taken down as a prospect — a name and a way to reach
 * them — and made a customer from the enquiry when there is something to quote or sample
 * [pages/EnquiryDetail.jsx `ConvertToCustomer`].
 */

const PROSPECT_FIELDS = ['name', 'contactPerson', 'mobile', 'whatsapp', 'email', 'city'];

export default function EnquiryForm({ enquiry, onClose, onSaved }) {
  const editing = Boolean(enquiry);

  const [error, setError] = useState(null);
  const [customer, setCustomer] = useState(
    enquiry?.customer?._id ?? enquiry?.customer ?? undefined
  );
  /* A new enquiry starts on the register; an existing one is whichever it is. */
  const [isProspect, setIsProspect] = useState(editing && !enquiry.customer);

  /*
   * Everything the buyer asked about, as one list.
   *
   * One piece of state rather than "the first model" plus "the others", which is what it was.
   * Splitting them meant the same item lived in two places on one form and the two could differ
   * while somebody typed — and it made the mould, the new-development tick and the colour rule
   * belong to item one alone, which is the whole thing being fixed here.
   *
   * `itemsForEdit` builds the list from the enquiry's own top line when the record predates the
   * field, so an old enquiry opens showing the model it names rather than an empty item.
   */
  const [items, setItems] = useState(() =>
    (editing ? itemsForEdit(enquiry, enquiry?.requirement) : []));

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
          prospect: Object.fromEntries(PROSPECT_FIELDS.map((key) => [key, enquiry.prospect?.[key] || ''])),
        }
      : { source: 'phone', prospect: {} },
  });

  const submit = async (values) => {
    setError(null);

    const prospect = isProspect
      ? Object.fromEntries(PROSPECT_FIELDS.map((key) => [key, values.prospect?.[key]?.trim() || undefined]).filter(([, value]) => value))
      : undefined;
    if (isProspect) {
      if (!prospect.name || prospect.name.length < 2) {
        setError({ message: 'Give the prospect\'s name — the company, or the person if there is no company.' });
        return;
      }
      if (!prospect.mobile && !prospect.whatsapp && !prospect.email) {
        setError({ message: 'Give a phone number or an email, so somebody can call them back.' });
        return;
      }
    } else if (!customer) {
      setError({ message: 'Pick the customer this enquiry belongs to — or take it down as a new prospect.' });
      return;
    }

    /*
     * Judged on the list, because the list is what is sent. The server asks the same question
     * and would refuse it — this is here so the answer arrives as a sentence beside the form
     * rather than as a refusal after a round trip, and so a person who filled in item 2 and
     * left item 1 blank is told which one is the problem.
     */
    const described = items.filter(filledItem);
    if (!described.length) {
      setError({ message: 'Say what the buyer asked about — fill in at least one item.' });
      return;
    }
    const vague = described.findIndex(
      (item) => !item.mould && !item.isNewDevelopment && !item.modelNumber?.trim()
    );
    if (vague >= 0) {
      setError({
        message: `Item ${vague + 1}: name the mould, or give the model number the buyer asked `
          + 'for, or mark it as a new development.',
      });
      return;
    }

    try {
      const { prospect: _typed, ...rest } = values;
      const payload = buildEnquiryPayload(rest, { items: itemsForSave(items) });

      onSaved(
        editing
          ? /* The customer is not sent: an enquiry pointed at a different buyer is a different
               enquiry, and the sample already on the bench was requested against this one. A
               prospect's own details are corrected until it is converted. */
            await enquiriesApi.update({ id: enquiry._id, ...payload, ...(isProspect ? { prospect } : {}) })
          : await enquiriesApi.create({ ...(isProspect ? { prospect } : { customer }), ...payload })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {!editing && (
          <div role="radiogroup" aria-label="Who is asking" className="flex flex-wrap gap-2 sm:col-span-2">
            {[[false, 'Existing customer'], [true, 'New prospect — not a customer yet']].map(([value, label]) => (
              <label
                key={label}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isProspect === value ? 'border-accent bg-accent/10 text-steel-50' : 'border-line/[0.12] text-steel-300'}`}
              >
                <input type="radio" name="buyer-kind" checked={isProspect === value} onChange={() => setIsProspect(value)} className="accent-current" />
                {label}
              </label>
            ))}
          </div>
        )}
        {isProspect ? (
          <fieldset className="grid gap-4 rounded-xl border border-line/[0.1] p-4 sm:col-span-2 sm:grid-cols-2" aria-label="Prospect">
            <legend className="px-1 text-xs font-bold uppercase tracking-[0.08em] text-steel-400">Prospect</legend>
            <p className="-mt-1 text-xs text-steel-400 sm:col-span-2">
              Not on the customer register yet. Convert them to a customer from the enquiry before a sample, a quotation or an order.
            </p>
            <Field label="Company / name" required>
              <input className="input" autoComplete="organization" {...register('prospect.name')} />
            </Field>
            <Field label="Contact person">
              <input className="input" {...register('prospect.contactPerson')} />
            </Field>
            <Field label="Mobile" hint="+91 is added for a 10-digit number">
              <input className="input" type="tel" inputMode="tel" {...register('prospect.mobile')} />
            </Field>
            <Field label="WhatsApp">
              <input className="input" type="tel" inputMode="tel" {...register('prospect.whatsapp')} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" {...register('prospect.email')} />
            </Field>
            <Field label="City">
              <input className="input" {...register('prospect.city')} />
            </Field>
          </fieldset>
        ) : (
          <Field
            label="Customer"
            className="sm:col-span-2"
            hint={
              editing
                ? 'Fixed — an enquiry for a different buyer is a different enquiry'
                : 'Not on the list? Take it down as a new prospect above, or send a chat screenshot to the WhatsApp number.'
            } required>
            <CustomerSelect
              value={customer}
              onChange={setCustomer}
              disabled={editing}
              aria-label="Customer"
            />
          </Field>
        )}
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
        items={items}
        onItemsChange={setItems}
        disabled={isSubmitting}
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
