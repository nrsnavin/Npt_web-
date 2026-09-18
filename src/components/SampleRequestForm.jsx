import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { samples as samplesApi } from '../api/endpoints.js';
import { Field, FormError, Notice } from './ui.jsx';
import {
  ColourInput, CustomerSelect, EnquirySelect, MaterialSelect, MouldSelect, PartSelect,
} from './pickers.jsx';
import { HANGER_CATEGORIES, SAMPLE_PURPOSES, numeric, text } from '../utils/pipeline.js';

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
export default function SampleRequestForm({ lead, sample, onClose, onSaved, onConverted }) {
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
  const [customer, setCustomer] = useState(sample?.customer?._id ?? sample?.customer ?? undefined);
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
  const [error, setError] = useState(null);
  /* What the request turned this lead into, once it has. See the panel below the submit. */
  const [made, setMade] = useState(null);

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
          standaloneReason: sample.standaloneReason || '',
        }
      : { quantity: 5, purpose: 'existing_model' },
  });

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
    if (standalone && !mould && !modelNumber?.trim()) {
      setError({ message: 'Pick a mould, or describe what to make.' });
      return;
    }

    /* The request it is *for* never moves. Re-pointing a sample at a different enquiry or buyer
       is not a correction, it is a different request — and the bench may already have made
       something against this one. */
    const fields = editing
      ? {}
      : {
          enquiry: forLead ? undefined : enquiry,
          /* A lead is not a customer yet, and the server refuses a request naming both. */
          customer: forLead ? undefined : customer,
          lead: lead?._id,
        };

    const payload = {
      ...fields,
      mould,
      modelNumber: text(values.modelNumber),
      category: text(values.category),
      sizeMm: numeric(values.sizeMm),
      materialRef: spec.materialRef || undefined,
      hookRef: spec.hookRef || undefined,
      clipRef: spec.clipRef || undefined,
      printRef: spec.printRef || undefined,
      /* Left blank, the server fills it from the resin's own colour. */
      colour: text(spec.colour),
      /*
       * Only when this form actually asked. Where the request has an enquiry behind it the
       * tick box is not drawn — the specification is the enquiry's — and sending `false` for
       * a box nobody was shown would silently overrule a buyer who *had* insisted on the
       * shade. Undefined lets what the enquiry recorded stand; `false` here is a real answer.
       */
      colourMandatory: standalone || forLead ? Boolean(spec.colourMandatory) : undefined,
      /* How many pieces to put in the courier bag — a figure the requester actually knows,
         unlike the order quantity an enquiry used to be asked for. */
      quantity: numeric(values.quantity),
      purpose: values.purpose,
      requiredDate: text(values.requiredDate),
      remarks: text(values.remarks),
      standaloneReason: forLead ? undefined : (standalone ? text(values.standaloneReason) : undefined),
    };

    try {
      /*
       * A lead's request is the one that does more than it says, so it is the one whose whole
       * answer is read — see `samples.createForLead`. The lists are refreshed straight away and
       * the form then stays open to report the conversion rather than vanishing: the records
       * that came into being are named here, once, where the person can follow them.
       */
      if (!editing && forLead) {
        const answer = await samplesApi.createForLead(payload);
        onSaved(answer.data);
        if (answer.converted) {
          setMade(answer.converted);
          return;
        }
        onClose();
        return;
      }

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

  /*
   * Said afterwards, because it was not asked for. The customer and the enquiry are named and
   * linked rather than described: "the lead was converted" leaves somebody hunting for what it
   * became, and the two records are the whole of what there is to check.
   */
  if (made) {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          <p className="font-semibold">Request raised — and {lead.company} is now a customer.</p>
          <p className="mt-1">
            An enquiry needs a buyer, so raising this lead&rsquo;s first enquiry put them on the
            customer list{made.attached ? ' — against the record that was already there' : ''}.
          </p>
        </Notice>

        <dl className="divide-y divide-line/[0.06] rounded-lg border border-line/[0.06]">
          <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
            <dt className="text-xs uppercase tracking-wide text-steel-500">Customer</dt>
            <dd className="text-sm">
              <Link to={`/customers/${made.customer.id}`} className="font-semibold text-steel-100 hover:text-accent">
                {made.customer.code} · {made.customer.name}
              </Link>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-3 py-2.5">
            <dt className="text-xs uppercase tracking-wide text-steel-500">Enquiry</dt>
            <dd className="text-sm">
              <Link to={`/enquiries/${made.enquiry.id}`} className="font-semibold text-steel-100 hover:text-accent">
                {made.enquiry.number}
              </Link>
            </dd>
          </div>
        </dl>

        {/*
          * The lead is reloaded on the way out, not on the way in.
          *
          * The page this dialog sits on is redrawn from that record, and it shows a spinner
          * while it reloads — which takes this panel down with it before anybody has read it.
          * So the refresh waits for the dismissal, which is also the better order: the two
          * records are named here, and the page behind is correct by the time it is seen.
          */}
        <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
          <button
            type="button"
            className="btn-primary"
            onClick={() => { onClose(); onConverted?.(made); }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {/*
        * What raising this does, before it is raised.
        *
        * Asking for a sample for a lead converts that lead: an enquiry needs a customer, so
        * raising the buyer's first enquiry is the same act as putting them on the master. That
        * is the right behaviour and it is more than the button says, so the form says it — a
        * consequence read for the first time in the confirmation afterwards is one that felt
        * like a mistake.
        */}
      {forLead && (
        <p className="rounded-lg border border-line/[0.06] bg-ink-800/40 p-3 text-sm text-steel-300">
          For <span className="font-semibold text-steel-100">{lead.company}</span> — a lead, so
          there is no enquiry to take the specification from.
          <span className="mt-1.5 block text-steel-400">
            Raising this makes them a customer and opens their first enquiry, from what you
            fill in below. If they are already on the customer list, the enquiry goes there.
          </span>
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

          <Field label="Model" hint="The mould it is made on, or describe it below">
            <MouldSelect value={mould} onChange={setMould} aria-label="Model" />
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
            <Field label="Size (mm)">
              <input type="number" className="input" {...register('sizeMm')} />
            </Field>
            <Field label="Material" hint="From the register — brings its colour">
              <MaterialSelect value={spec.materialRef} onChange={setPick('materialRef')} aria-label="Material" />
            </Field>
            <Field label="Colour" hint="The resin's, unless the buyer named a shade">
              <ColourInput value={spec.colour} onChange={setPick('colour')} aria-label="Colour" />
            </Field>
            {/*
              Beside the colour, because it is a fact about that colour. Unticked is the ordinary
              case — a buyer wanting a white hanger to look at is answered by the nearest white on
              the rack, and waiting three weeks for an exact shade answers a question nobody
              asked. Ticked withdraws that licence, for the buyer matching a garment.
            */}
            <label className="flex items-start gap-2.5 text-sm text-steel-200 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-flame-500"
                checked={Boolean(spec.colourMandatory)}
                onChange={(event) => setPick('colourMandatory')(event.target.checked)}
                aria-label="Colour and model must match exactly"
              />
              <span>
                This colour and model exactly — no substitute
                <span className="mt-0.5 block text-xs text-steel-500">
                  Leave unticked and the bench may send the nearest colour it has, preferring the
                  one above. Tick it and the sample is only sent in this colour, on this model.
                </span>
              </span>
            </label>
            <Field label="Hook">
              <PartSelect kind="hook" value={spec.hookRef} onChange={setPick('hookRef')} aria-label="Hook" />
            </Field>
            <Field label="Clip">
              <PartSelect kind="clip" value={spec.clipRef} onChange={setPick('clipRef')} aria-label="Clip" />
            </Field>
            <Field label="Printing" className="sm:col-span-2">
              <PartSelect kind="print" value={spec.printRef} onChange={setPick('printRef')} aria-label="Printing" />
            </Field>
          </div>
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
