import { useEffect, useState } from 'react';
import { machinesApi } from '../api/endpoints.js';

/**
 * Picks a machine. A plain select: a plant has tens of presses, not thousands, and the list is the
 * quickest way to see them all. Machines switched off are not offered, except the one already
 * chosen.
 */
export default function MachineSelect({ value, onChange, emptyLabel = 'No machine', id, ...rest }) {
  const [machines, setMachines] = useState([]);
  useEffect(() => {
    let live = true;
    machinesApi.list().then((rows) => live && setMachines(rows || [])).catch(() => {});
    return () => { live = false; };
  }, []);
  const offered = machines.filter((machine) => machine.active !== false || machine._id === value);
  return (
    <select id={id} className="input" value={value || ''} onChange={(event) => onChange(event.target.value)} {...rest}>
      <option value="">{emptyLabel}</option>
      {offered.map((machine) => (
        <option key={machine._id} value={machine._id}>
          {machine.code}{machine.name ? ` — ${machine.name}` : ''}{machine.tonnage ? ` · ${machine.tonnage}T` : ''}
        </option>
      ))}
    </select>
  );
}

/** Picks several presses — one tap a press, its chip lit when chosen. `value` is a list of ids. */
export function MachinePicks({ value = [], onChange, label = 'Presses' }) {
  const [machines, setMachines] = useState([]);
  useEffect(() => {
    let live = true;
    machinesApi.list().then((rows) => live && setMachines(rows || [])).catch(() => {});
    return () => { live = false; };
  }, []);
  const chosen = new Set(value.map(String));
  const offered = machines.filter((machine) => machine.active !== false || chosen.has(String(machine._id)));
  const flip = (id) => onChange(chosen.has(id) ? value.filter((entry) => String(entry) !== id) : [...value, id]);
  if (!offered.length) return <p className="text-xs text-steel-500">No presses on the register yet.</p>;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {offered.map((machine) => {
        const on = chosen.has(String(machine._id));
        return (
          <button
            key={machine._id}
            type="button"
            aria-pressed={on}
            onClick={() => flip(String(machine._id))}
            className={`rounded-md border px-2.5 py-1 text-xs ${on ? 'border-accent/60 bg-accent/15 font-semibold text-accent' : 'border-line/[0.1] bg-line/[0.03] text-steel-300'}`}
          >
            {on ? '✓ ' : ''}{machine.code}{machine.tonnage ? ` · ${machine.tonnage}T` : ''}
          </button>
        );
      })}
    </div>
  );
}
