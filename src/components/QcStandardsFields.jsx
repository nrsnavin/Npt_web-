import { Field } from './ui.jsx';
import { AQL_LEVELS } from '../utils/records.js';

/**
 * A model's or a buyer's test standards [server: models/qcStandards.schema.js] — the minimums a QC
 * sheet starts with. Folded away: most models never need them, and the ones that do are set once.
 * The buyer's figures win over the model's on the sheet.
 *
 * Registered on the surrounding react-hook-form as `qcStandards.<key>`; `standardsPayload` turns what
 * was typed into what the server takes (blank clears a figure).
 */
export const STANDARD_FIELDS = [
  ['breakingMinKg', 'Breaking strength, min kgf'],
  ['hookPullMinKg', 'Hook pull-out, min kgf'],
  ['clipGripMinKg', 'Clip grip, min kgf'],
  ['hookTurns', 'Hook swivel turns, min'],
  ['hangLoadKg', 'Hang load, kg'],
  ['hangHours', 'Hang for, hours'],
  ['allowedDeflectionMm', 'Bend allowed, mm'],
  ['weightToleranceG', 'Weight tolerance, ± g'],
  ['widthToleranceMm', 'Width tolerance, ± mm'],
  ['dropHeightCm', 'Drop height, cm'],
  ['drops', 'Drops'],
  ['moistureMaxPercent', 'Resin moisture, max %'],
  ['mfiMin', 'MFI from, g/10 min'],
  ['mfiMax', 'MFI to, g/10 min'],
  ['shrinkageMaxPercent', 'Shrinkage, max %'],
  ['uvHours', 'UV exposure, hours'],
  ['cartonDropCm', 'Carton drop, cm'],
  ['piecesPerCarton', 'Pieces per carton'],
];

export function standardsPayload(values, { clearing = false } = {}) {
  const typed = values || {};
  const out = {};
  for (const [key] of STANDARD_FIELDS) {
    const value = typed[key];
    if (value === '' || value == null) { if (clearing) out[key] = null; } else out[key] = Number(value);
  }
  if (typed.aql === '' || typed.aql == null) { if (clearing) out.aql = null; } else out.aql = Number(typed.aql);
  if (typed.notes) out.notes = typed.notes;
  return clearing || Object.keys(out).length ? out : undefined;
}

export default function QcStandardsFields({ register, who = 'model', open = false }) {
  return (
    <details className="rounded-xl border border-line/[0.08] p-4" open={open}>
      <summary className="cursor-pointer text-sm font-semibold text-steel-100">
        Test standards <span className="font-normal text-steel-400">— the minimums this {who} is QC-tested against</span>
      </summary>
      <p className="mt-2 text-xs text-steel-500">
        {who === 'buyer'
          ? 'Only where this buyer asks for more than the model’s own standards — these win on the QC sheet.'
          : 'They fill the QC sheet when it is opened for this model. A buyer’s own standards, where set, win.'}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {STANDARD_FIELDS.map(([key, label]) => (
          <Field key={key} label={label}>
            <input type="number" min="0" step="any" className="input" {...register(`qcStandards.${key}`)} />
          </Field>
        ))}
        <Field label="AQL for sampling">
          <select className="input" {...register('qcStandards.aql')}>
            <option value="">None</option>
            {AQL_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes" className="mt-3">
        <input className="input" maxLength={500} {...register('qcStandards.notes')} placeholder="E.g. buyer’s test method, lab report needed" />
      </Field>
    </details>
  );
}
