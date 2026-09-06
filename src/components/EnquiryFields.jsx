import { Field, Notice } from './ui.jsx';
import { ColourInput, MaterialSelect, MouldSelect, PartSelect } from './pickers.jsx';
import { HANGER_CATEGORIES } from '../utils/pipeline.js';

/**
 * The requirement half of an enquiry, shared by the enquiry form and by lead conversion.
 *
 * `prefix` lets the same fields sit at the root of one form and under `enquiry.` in
 * another, so conversion can post a nested enquiry without a second copy of this markup.
 *
 * **Everything that names a thing is a register pick** [§28] — the tool, the resin, the hook,
 * the clip, the print — so an enquiry describes the same job in the same words as the sample the
 * buyer approves and the order booked against it. That is what makes §13's "correct colour" a
 * comparison rather than two boxes of similar text.
 *
 * **And there is no quantity.** An enquiry used to require one, and it was the wrong question at
 * the wrong moment: nobody knows how many at this stage, so the polite figure a buyer gives on
 * the phone travelled the whole chain as though it were a commitment. What can honestly be said
 * about size is the estimated value below, which says on its face that it is an estimate.
 *
 * The five picks are held by the caller and passed in, exactly as the mould already is: they are
 * controlled selects rather than registered inputs, and threading them through react-hook-form
 * would be a `Controller` each for no gain.
 */
export default function EnquiryFields({
  register,
  prefix = '',
  mould,
  onMouldChange,
  spec = {},
  onSpecChange = () => {},
  newDevelopment,
  onNewDevelopmentChange,
  errors = {},
}) {
  const name = (field) => `${prefix}${field}`;
  const set = (key) => (value) => onSpecChange({ ...spec, [key]: value });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Model"
          className="sm:col-span-2"
          hint={
            newDevelopment
              ? 'A new development has no tool yet'
              : 'The mould that makes it — leave empty for anything bought in'
          }
        >
          <MouldSelect
            value={mould}
            onChange={onMouldChange}
            disabled={newDevelopment}
            aria-label="Model"
          />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 text-sm text-steel-200">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-flame-500"
          checked={newDevelopment}
          onChange={(event) => onNewDevelopmentChange(event.target.checked)}
        />
        <span>
          New development
          <span className="mt-0.5 block text-xs text-steel-500">
            Nothing on the register matches and nothing is bought in. Describe it below; it
            becomes a model on the register once the tool is cut.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={newDevelopment ? 'Describe the model' : 'Model reference'}
          className="sm:col-span-2"
          hint="What the buyer asked for, in their words — the whole of it for anything bought in"
        >
          <input className="input" {...register(name('requirement.modelNumber'))} />
        </Field>
        <Field label="Category">
          <select className="input" {...register(name('requirement.category'))}>
            <option value="">—</option>
            {HANGER_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Size (mm)">
          <input type="number" className="input" {...register(name('requirement.sizeMm'))} />
        </Field>
        <Field label="Material" hint="From the register — brings its colour">
          <MaterialSelect value={spec.materialRef} onChange={set('materialRef')} aria-label="Material" />
        </Field>
        <Field label="Colour" hint="The resin's, unless the buyer named a shade">
          <ColourInput value={spec.colour} onChange={set('colour')} aria-label="Colour" />
        </Field>
        <Field label="Hook">
          <PartSelect kind="hook" value={spec.hookRef} onChange={set('hookRef')} aria-label="Hook" />
        </Field>
        <Field label="Clip">
          <PartSelect kind="clip" value={spec.clipRef} onChange={set('clipRef')} aria-label="Clip" />
        </Field>
        <Field label="Printing">
          <PartSelect kind="print" value={spec.printRef} onChange={set('printRef')} aria-label="Printing" />
        </Field>
        <Field label="Target price (₹)">
          <input type="number" step="0.01" className="input" {...register(name('targetPrice'))} />
        </Field>
        <Field label="Packing">
          <input className="input" placeholder="200 pcs per carton" {...register(name('requirement.packing'))} />
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

      {!mould && !newDevelopment && (
        <Notice tone="info">
          Name the mould, or give the model number the buyer asked for — a piece we buy in and
          resell has no tool of ours. Tick new development if it is neither.
        </Notice>
      )}
    </div>
  );
}
