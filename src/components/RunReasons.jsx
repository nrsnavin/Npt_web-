import { useEffect, useState } from 'react';
import { mouldRunsApi } from '../api/endpoints.js';
import { codedForSave } from '../utils/oee.js';

/**
 * The fixed lists a stop and a reject are coded from [server: config/productionReasons.js] —
 * fetched once and shared by every form that codes them.
 */
let cached = null;
export function useRunReasons() {
  const [reasons, setReasons] = useState(cached);
  useEffect(() => {
    if (cached) return undefined;
    let live = true;
    mouldRunsApi.reasons().then((value) => { cached = value; if (live) setReasons(value); }).catch(() => null);
    return () => { live = false; };
  }, []);
  return reasons || { downtime: [], rejects: [] };
}

/**
 * Rows of a coded reason and a number — stops with their minutes, rejects with their pieces.
 * `unit` names the number; the parent holds the rows.
 */
export function CodedRows({ label, options, rows, onChange, unit, unitLabel, addLabel }) {
  const update = (index, patch) => onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-steel-200">{label}</legend>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <select className="input min-w-[12rem] flex-1" aria-label={`${label} ${index + 1} reason`} value={row.reason} onChange={(event) => update(index, { reason: event.target.value })}>
            <option value="">Pick a reason</option>
            {options.map((option) => <option key={option.key} value={option.key}>{option.label}{option.planned ? ' (planned)' : ''}</option>)}
          </select>
          <input type="number" min={0} className="input w-28" aria-label={`${label} ${index + 1} ${unitLabel}`} placeholder={unitLabel} value={row[unit]} onChange={(event) => update(index, { [unit]: event.target.value })} />
          <button type="button" className="row-action-danger" onClick={() => onChange(rows.filter((_, at) => at !== index))}>Remove</button>
        </div>
      ))}
      <button type="button" className="row-action" onClick={() => onChange([...rows, { reason: '', [unit]: '' }])}>{addLabel}</button>
    </fieldset>
  );
}

export { codedForSave };
