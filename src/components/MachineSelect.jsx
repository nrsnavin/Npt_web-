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
