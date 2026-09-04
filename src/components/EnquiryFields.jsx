import { Field, Notice } from './ui.jsx';
import { MouldSelect } from './pickers.jsx';
import { HANGER_CATEGORIES, MATERIALS } from '../utils/pipeline.js';

/**
 * The requirement half of an enquiry, shared by the enquiry form and by lead conversion.
 *
 * `prefix` lets the same fields sit at the root of one form and under `enquiry.` in
 * another, so conversion can post a nested enquiry without a second copy of this markup.
 */
export default function EnquiryFields({ register, prefix = '', mould, onMouldChange, newDevelopment, onNewDevelopmentChange, errors = {} }) {
  const name = (field) => `${prefix}${field}`;

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
        <Field label="Material">
          <select className="input" {...register(name('requirement.material'))}>
            <option value="">—</option>
            {MATERIALS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Size (mm)">
          <input type="number" className="input" {...register(name('requirement.sizeMm'))} />
        </Field>
        <Field label="Colour">
          <input className="input" {...register(name('requirement.colour'))} />
        </Field>
        <Field label="Quantity" error={errors?.requirement?.quantity}>
          <input
            type="number"
            className="input"
            {...register(name('requirement.quantity'), { required: 'Quantity is required' })}
          />
        </Field>
        <Field label="Target price (₹)">
          <input type="number" step="0.01" className="input" {...register(name('targetPrice'))} />
        </Field>
        <Field label="Printing">
          <input className="input" placeholder="Buyer logo, single colour" {...register(name('requirement.printing'))} />
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

      <div className="rounded-lg border border-line/[0.06] p-4">
        <p className="mb-3 text-sm text-steel-400">
          An open enquiry always carries a next step, so it can never go quiet.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next action" error={errors?.nextAction}>
            <input
              className="input"
              placeholder="Send the quote"
              {...register(name('nextAction'), { required: 'A next action is required' })}
            />
          </Field>
          <Field label="Follow up on" error={errors?.nextFollowUpDate}>
            <input
              type="date"
              className="input"
              {...register(name('nextFollowUpDate'), { required: 'A follow-up date is required' })}
            />
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
