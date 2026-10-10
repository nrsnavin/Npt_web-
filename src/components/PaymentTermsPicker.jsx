import { Field } from './ui.jsx';
import { PAYMENT_PRESETS, presetFor } from '../utils/paymentTerms.js';

/**
 * Payment terms on an order: a preset, or the two numbers by hand. These decide what Payment
 * Collection must collect before production starts and before the goods leave.
 *
 * `value` is `{ advancePercent, beforeDispatchPercent }`; `onChange` gets the same shape back,
 * plus `label` — the preset's words, for the free-text terms on the document.
 */
export default function PaymentTermsPicker({ value, onChange }) {
  const preset = presetFor(value);

  const choose = (key) => {
    if (key === 'custom') {
      onChange({ ...value, custom: true });
      return;
    }
    const picked = PAYMENT_PRESETS.find((entry) => entry.key === key);
    onChange({ advancePercent: picked.advancePercent, beforeDispatchPercent: picked.beforeDispatchPercent, label: picked.label });
  };
  /* Numbers that match no preset are custom terms, and show as such. */
  const showNumbers = preset === null || value.custom;

  return (
    <div className="space-y-3 rounded-xl border border-line/[0.08] bg-line/[0.02] p-4">
      <Field label="Payment terms" hint="What Payment Collection must collect before production and before dispatch">
        <select
          className="input"
          aria-label="Payment terms"
          value={showNumbers ? 'custom' : preset?.key || 'credit'}
          onChange={(event) => choose(event.target.value)}
        >
          {PAYMENT_PRESETS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          <option value="custom">Other — set the percentages</option>
        </select>
      </Field>
      {showNumbers && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="% before production" hint="The advance">
            <input
              type="number" min="0" max="100" className="input"
              value={value.advancePercent ?? 0}
              onChange={(event) => onChange({ ...value, advancePercent: Number(event.target.value), custom: true })}
            />
          </Field>
          <Field label="% before dispatch" hint="In total, advance included">
            <input
              type="number" min="0" max="100" className="input"
              value={value.beforeDispatchPercent ?? 0}
              onChange={(event) => onChange({ ...value, beforeDispatchPercent: Number(event.target.value), custom: true })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
