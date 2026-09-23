import { Field } from './ui.jsx';
import ItemCards from './ItemCards.jsx';

/**
 * The requirement half of an enquiry, shared by the enquiry form and by lead conversion.
 *
 * `prefix` lets the same fields sit at the root of one form and under `enquiry.` in another, so
 * conversion can post a nested enquiry without a second copy of this markup.
 *
 * **What the buyer asked about is a list of items, and nothing on this form is above it.** It
 * used to be: one model was entered here through the form's own fields — the tool, the resin,
 * the hook, the colour and whether that colour binds the bench — and anything else the buyer
 * mentioned went into a reduced panel underneath. That made every model after the first a lesser
 * record, unable to name a tool [§28] and so unable to be costed against one, sampled from one,
 * or quoted as the piece the buyer approved. The items are entered in `ItemCards` now, each with
 * the same complete set of options, and the server keeps the first one and the enquiry's own flat
 * fields in step.
 *
 * What is left here is what belongs to the enquiry rather than to any one model: the target
 * price, the delivery date, the estimated value, the remarks and the next step. Asking those per
 * item would be asking the wrong question — a buyer names one delivery date for the call.
 */
export default function EnquiryFields({
  register,
  prefix = '',
  items = [],
  onItemsChange = () => {},
  disabled,
  errors = {},
}) {
  const name = (field) => `${prefix}${field}`;

  return (
    <div className="space-y-5">
      <ItemCards items={items} onChange={onItemsChange} disabled={disabled} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target price (₹)" hint="What the buyer wants to pay, if they said">
          <input type="number" step="0.01" className="input" {...register(name('targetPrice'))} />
        </Field>
        <Field label="Required delivery date">
          <input type="date" className="input" {...register(name('requiredDeliveryDate'))} />
        </Field>
        <Field label="Estimated value (₹)">
          <input type="number" className="input" {...register(name('estimatedValue'))} />
        </Field>
      </div>

      <Field label="Remarks">
        <textarea rows={2} className="input" {...register(name('remarks'))} />
      </Field>

      {/*
        Offered, not demanded.
        §3 wants an open enquiry to carry a next step, and this used to refuse to save without
        one. That enforced the rule against the one moment nobody may know yet — a walk-in at
        the counter, a message pasted in at seven in the evening — and what it produced was not
        diligence but "follow up" and a date three days out, typed to get past the form. So the
        fields stay, the prompt stays, and the record is accepted either way; the discipline
        lands when the enquiry is *moved*, where every action fills a next step in for you.
      */}
      <div className="rounded-lg border border-line/[0.06] p-4">
        <p className="mb-3 text-sm text-steel-400">
          An enquiry with a next step never goes quiet. Leave it blank if it is too early to
          say &mdash; it will show as one to come back to, and the first stage move sets one.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next action" error={errors?.nextAction} hint="Optional">
            <input
              className="input"
              placeholder="Send the quote"
              {...register(name('nextAction'))}
            />
          </Field>
          <Field label="Follow up on" error={errors?.nextFollowUpDate} hint="Optional">
            <input type="date" className="input" {...register(name('nextFollowUpDate'))} />
          </Field>
        </div>
      </div>
    </div>
  );
}
