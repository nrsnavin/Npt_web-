import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { samples as samplesApi } from '../api/endpoints.js';
import { Field, FormError, Notice } from './ui.jsx';
import {
  ColourInput, EnquirySelect, MaterialSelect, MouldSelect, PartSelect,
} from './pickers.jsx';
import ItemCards, { filledItem, itemsForSave } from './ItemCards.jsx';
import { SAMPLE_PURPOSES, itemForEdit, numeric, text } from '../utils/pipeline.js';

/**
 * Raising a sample request, from wherever it is being asked for.
 *
 * Always on an enquiry: every sample is raised on one, and the buyer and what to make come from
 * it [server: services/enquiryLink.service.js]. A request raised before that rule, with no
 * enquiry behind it, can still be corrected here.
 */
export default function SampleRequestForm({ sample, onClose, onSaved }) {
  /*
   * The same form raises a request and corrects one.
   *
   * A sample request is typed in a hurry off a phone call — the size is wrong, the colour was
   * misheard, the date was optimistic — and until now the only way to fix any of it was to
   * abandon the request and raise a second one. That leaves two samples for one job on the
   * bench's queue and no way to tell which the buyer is waiting for.
   */
  const editing = Boolean(sample);

  const [enquiry, setEnquiry] = useState(sample?.enquiry?._id ?? sample?.enquiry ?? undefined);
  const [customer] = useState(sample?.customer?._id ?? sample?.customer ?? undefined);
  const [mould, setMould] = useState(sample?.mould?._id ?? sample?.mould ?? undefined);
  /*
   * The register picks [§28], held here like the mould rather than registered with the form:
   * they are controlled selects. A sample carries the same four references an order line does,
   * and that is what makes "approved sample" a comparison later — the sample the buyer signed
   * off and the order booked against it point at the same register rows.
   */
  const [spec, setSpec] = useState(
    sample
      ? {
          materialRef: sample.materialRef?._id ?? sample.materialRef ?? undefined,
          hookRef: sample.hookRef?._id ?? sample.hookRef ?? undefined,
          clipRef: sample.clipRef?._id ?? sample.clipRef ?? undefined,
          printRef: sample.printRef?._id ?? sample.printRef ?? undefined,
          colour: sample.colour || '',
          colourMandatory: Boolean(sample.colourMandatory),
        }
      : {}
  );
  const setPick = (key) => (value) => setSpec((current) => ({ ...current, [key]: value }));

  /*
   * The other models going in the same bag.
   *
   * The fields above are the first of them — the server keeps the two in step — so this holds
   * rows two onward, exactly as the enquiry form does. A buyer comparing three hangers
   * asks for one envelope, and raising three requests for it gives the bench three jobs, three
   * required dates and three couriers for one padded bag.
   */
  /*
   * The whole bag, as one list.
   *
   * It used to be "the first model" — entered through this form's own fields, with the mould
   * and the colour rule on it — plus "the extras" in a panel called "Also in the bag". That
   * made every model after the first a lesser thing: it could be described but could not name
   * the tool it runs on, so the bench was told what made hanger one and nothing about hanger
   * two. Now every model in the bag is entered the same way.
   */
  const [bag, setBag] = useState(() => (sample?.items?.length
    ? sample.items.map(itemForEdit)
    : (sample ? [itemForEdit(sample)] : [])));
  const [error, setError] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: sample
      ? {
          modelNumber: sample.modelNumber || '',
          category: sample.category || '',
          sizeMm: sample.sizeMm ?? '',
          quantity: sample.quantity ?? 5,
          purpose: sample.purpose || 'existing_model',
          requiredDate: sample.requiredDate ? sample.requiredDate.slice(0, 10) : '',
          remarks: sample.remarks || '',
        }
      : { quantity: 5, purpose: 'existing_model' },
  });

  const modelNumber = watch('modelNumber');
  /* Only a request from before every sample had an enquiry has nothing to inherit from. */
  const standalone = editing && !enquiry;
  /* Where the bench has to be told what to make — and so where a list of models belongs. */
  const asksWhatToMake = standalone;

  const submit = async (values) => {
    setError(null);
    if (!editing && !enquiry) {
      setError({ message: 'Pick the enquiry this sample is for. No enquiry yet? Raise it first.' });
      return;
    }

    // With an enquiry the requirement comes from it; without one it has to be said here.
    if (asksWhatToMake) {
      const described = bag.filter(filledItem);
      if (!described.length) {
        setError({ message: 'Tell the bench what to make — fill in at least one item.' });
        return;
      }
      const vague = described.findIndex((item) => !item.mould && !item.modelNumber?.trim());
      if (vague >= 0) {
        setError({ message: `Item ${vague + 1}: pick a mould, or describe what to make.` });
        return;
      }
    }

    /* The request it is *for* never moves. Re-pointing a sample at a different enquiry or buyer
       is not a correction, it is a different request — and the bench may already have made
       something against this one. */
    const fields = editing ? {} : { enquiry };

    /*
     * The bag as it goes on the wire, and the top line taken from its first model.
     *
     * The server keeps `items[0]` and the request's own top line in step, so both are sent
     * saying the same thing rather than the form being asked to choose which is senior.
     */
    const rows = asksWhatToMake ? itemsForSave(bag, { withQuantity: true }) : [];
    const first = rows[0] || {};

    const payload = {
      ...fields,
      /* With an enquiry behind it this form does not ask what to make — the specification is
         the enquiry's, and so are its models — so nothing here may overwrite what it carried. */
      ...(asksWhatToMake
        ? {
          mould: first.mould || undefined,
          modelNumber: first.modelNumber,
          category: first.category,
          sizeMm: first.sizeMm,
          materialRef: first.materialRef,
          hookRef: first.hookRef,
          clipRef: first.clipRef,
          printRef: first.printRef,
          /* Left blank, the server fills it from the resin's own colour. */
          colour: first.colour,
          /*
           * A real answer, because this form asked. Where the request has an enquiry behind it
           * the tick box is not drawn, and sending `false` for a box nobody was shown would
           * silently overrule a buyer who *had* insisted on the shade.
           */
          colourMandatory: Boolean(first.colourMandatory),
          items: rows,
        }
        : {}),
      /* How many pieces to put in the courier bag — a figure the requester actually knows,
         unlike the order quantity an enquiry used to be asked for. */
      quantity: numeric(values.quantity),
      purpose: values.purpose,
      requiredDate: text(values.requiredDate),
      remarks: text(values.remarks),
    };

    try {
      onSaved(
        editing
          ? await samplesApi.update({ id: sample._id, ...payload })
          : await samplesApi.create(payload)
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
          label="Enquiry"
          className="sm:col-span-2"
          required={!editing}
          hint={editing ? 'A request stays with the enquiry it was raised on' : 'Every sample is raised on an enquiry — the buyer and what to make come from it'}
        >
          <EnquirySelect value={enquiry} onChange={setEnquiry} customer={customer} aria-label="Enquiry" disabled={editing} />
        </Field>
      </div>

      {asksWhatToMake && (
        <div className="space-y-5 rounded-lg border border-line/[0.06] p-4">
          <p className="text-sm text-steel-400">
            With no enquiry to take it from, the bench needs to be told what to make.
          </p>

          <ItemCards
            items={bag}
            onChange={setBag}
            disabled={isSubmitting}
            withQuantity
            title="What to make"
            hint="One item per model going in the envelope. Add another for anything else."
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pieces to make" error={errors.quantity} hint="What goes in the courier bag" required>
          <input type="number" className="input" {...register('quantity', { required: 'How many?' })} />
        </Field>
        <Field label="Purpose">
          <select className="input" {...register('purpose')}>
            {SAMPLE_PURPOSES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Required by" className="sm:col-span-2" hint="Today if left empty — re-date it if the bench needs longer">
          <input type="date" className="input" {...register('requiredDate')} />
        </Field>
      </div>

      <Field label="Remarks">
        <textarea rows={2} className="input" {...register('remarks')} />
      </Field>

      <FormError error={error} />

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting
            ? editing ? 'Saving…' : 'Raising…'
            : editing ? 'Save changes' : 'Raise request'}
        </button>
      </div>
    </form>
  );
}
