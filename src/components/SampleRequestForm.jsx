import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { samples as samplesApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { CustomerSelect, EnquirySelect, ProductSelect } from './pickers.jsx';
import { HANGER_CATEGORIES, MATERIALS, SAMPLE_PURPOSES, numeric, text } from '../utils/pipeline.js';

/**
 * Raising a sample request, from wherever it is being asked for.
 *
 * One form for three starting points, because they differ only in what is already decided:
 * from the sample queue nothing is, and the enquiry and the customer are both pickers; from a
 * lead the party is settled and neither picker is drawn.
 *
 * A lead's request is "standalone" in the sense the bench cares about — there is no enquiry to
 * inherit a specification from, and a lead carries a free-text interest rather than a model —
 * so the block asking what to make is shown for it too. That is the only thing the bench
 * actually needs; who asked is a link, not a specification.
 */
export default function SampleRequestForm({ lead, onClose, onSaved }) {
  const [enquiry, setEnquiry] = useState(undefined);
  const [customer, setCustomer] = useState(undefined);
  const [product, setProduct] = useState(undefined);
  const [error, setError] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { quantity: 5, purpose: 'existing_model' } });

  const modelNumber = watch('modelNumber');
  /*
   * Standalone means "nothing to inherit a specification from", which is true of a lead's
   * request as much as of a counter request — a lead has a free-text interest, not a model. So
   * the block asking what to make is shown in both cases, and the enquiry and customer pickers
   * are simply not drawn when the party is already decided.
   */
  const standalone = !enquiry;
  const forLead = Boolean(lead);

  const submit = async (values) => {
    setError(null);

    // With an enquiry the requirement comes from it; without one it has to be said here.
    if (standalone && !product && !modelNumber?.trim()) {
      setError({ message: 'Pick a model, or describe what to make.' });
      return;
    }

    try {
      onSaved(
        await samplesApi.create({
          enquiry: forLead ? undefined : enquiry,
          /* A lead is not a customer yet, and the server refuses a request naming both. */
          customer: forLead ? undefined : customer,
          lead: lead?._id,
          product,
          modelNumber: text(values.modelNumber),
          category: text(values.category),
          material: text(values.material),
          sizeMm: numeric(values.sizeMm),
          colour: text(values.colour),
          printing: text(values.printing),
          quantity: numeric(values.quantity),
          purpose: values.purpose,
          requiredDate: text(values.requiredDate),
          remarks: text(values.remarks),
          standaloneReason: forLead ? undefined : (standalone ? text(values.standaloneReason) : undefined),
        })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {forLead && (
        <p className="rounded-lg border border-line/[0.06] bg-ink-800/40 p-3 text-sm text-steel-300">
          For <span className="font-semibold text-steel-100">{lead.company}</span> — a lead, so
          there is no enquiry to take the specification from. It moves onto the customer when
          this lead is converted.
        </p>
      )}

      {!forLead && (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Enquiry"
          className="sm:col-span-2"
          hint="Leave it standalone if nobody has raised one — it can be attached later"
        >
          <EnquirySelect value={enquiry} onChange={setEnquiry} customer={customer} aria-label="Enquiry" />
        </Field>

        {standalone && (
          <>
            <Field
              label="Customer"
              className="sm:col-span-2"
              hint="Not in the list? Add them here. Leave it as an internal trial if there is no buyer."
            >
              <CustomerSelect
                value={customer}
                onChange={setCustomer}
                // Named as a decision, not a prompt: no customer is a legitimate answer here,
                // and "Select a customer…" reads like a field waiting to be filled.
                emptyLabel="No customer — internal trial"
                aria-label="Customer"
              />
            </Field>
            <Field label="Why, without an enquiry" className="sm:col-span-2">
              <input
                className="input"
                placeholder="Asked for one at the counter"
                {...register('standaloneReason')}
              />
            </Field>
          </>
        )}
      </div>
      )}

      {(standalone || forLead) && (
        <div className="space-y-5 rounded-lg border border-line/[0.06] p-4">
          <p className="text-sm text-steel-400">
            With no enquiry to take it from, the bench needs to be told what to make.
          </p>

          <Field label="Model" hint="From the catalogue, or describe it below">
            <ProductSelect value={product} onChange={setProduct} aria-label="Model" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Model reference" className="sm:col-span-2">
              <input className="input" placeholder="Matte 400mm white" {...register('modelNumber')} />
            </Field>
            <Field label="Category">
              <select className="input" {...register('category')}>
                <option value="">—</option>
                {HANGER_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Material">
              <select className="input" {...register('material')}>
                <option value="">—</option>
                {MATERIALS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Size (mm)">
              <input type="number" className="input" {...register('sizeMm')} />
            </Field>
            <Field label="Colour">
              <input className="input" {...register('colour')} />
            </Field>
            <Field label="Printing" className="sm:col-span-2">
              <input className="input" {...register('printing')} />
            </Field>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantity" error={errors.quantity}>
          <input type="number" className="input" {...register('quantity', { required: 'How many?' })} />
        </Field>
        <Field label="Purpose">
          <select className="input" {...register('purpose')}>
            {SAMPLE_PURPOSES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Required by" className="sm:col-span-2" hint="A week from today if left empty">
          <input type="date" className="input" {...register('requiredDate')} />
        </Field>
      </div>

      <Field label="Remarks">
        <textarea rows={2} className="input" {...register('remarks')} />
      </Field>

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
          {isSubmitting ? 'Raising…' : 'Raise request'}
        </button>
      </div>
    </form>
  );
}
