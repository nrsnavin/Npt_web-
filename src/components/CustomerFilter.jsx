import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';

/**
 * The customer filter every list shares — the queues, the desks, the task lists, the enquiries:
 * "All customers" or one buyer, each with how many of the rows are theirs, built from the rows
 * themselves so it never offers a buyer with nothing here. `nameOf(row)` reads a row's buyer.
 */
export const NO_CUSTOMER = '__none__';

export function customerOptions(rows, nameOf) {
  const counts = new Map();
  for (const row of rows || []) {
    const name = String(nameOf(row) || '').trim() || NO_CUSTOMER;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a === NO_CUSTOMER ? 1 : b === NO_CUSTOMER ? -1 : a.localeCompare(b)))
    .map(([name, count]) => ({ name, count }));
}

/** Rows for one buyer, or every row for "all" (an empty value). */
export const byCustomer = (rows, nameOf, value) => (!value ? rows || []
  : (rows || []).filter((row) => (String(nameOf(row) || '').trim() || NO_CUSTOMER) === value));

export default function CustomerFilter({ rows, nameOf, value, onChange, className = '' }) {
  const options = useMemo(() => customerOptions(rows, nameOf), [rows, nameOf]);
  /* The buyer picked is gone from the rows (moved on, or loaded again): the list goes back to all of them. */
  useEffect(() => {
    if (value && rows && !options.some((option) => option.name === value)) onChange('');
  }, [value, rows, options, onChange]);
  return (
    <select
      aria-label="Customer"
      className={`input w-full sm:w-56 ${className}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">All customers ({(rows || []).length})</option>
      {options.map((option) => (
        <option key={option.name} value={option.name}>{option.name === NO_CUSTOMER ? 'No customer' : option.name} ({option.count})</option>
      ))}
    </select>
  );
}

/**
 * A job's place in a queue [server: queuePlaces.service] — "Production queue · 3 of 12" — counted
 * over the whole queue, linked to it. Nothing when it is in no queue.
 */
export function QueuePlace({ place, places, className = '' }) {
  const list = (places || (place ? [place] : [])).filter(Boolean);
  if (!list.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {list.map((entry) => (
        <Link
          key={`${entry.queue}-${entry.task}`}
          to={entry.path || '/production/queue'}
          title={`${entry.place} of ${entry.of} in the ${entry.queue} queue, by EDD`}
          className="rounded-full bg-aqua-500/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-aqua-300 ring-1 ring-inset ring-aqua-500/25 hover:bg-aqua-500/25"
        >
          {entry.queue} queue · {entry.place} of {entry.of}
        </Link>
      ))}
    </span>
  );
}

/** Every job's place in the queues, read once for a list [server: GET /production/queue-places]. */
export function useQueuePlaces() {
  const [places, setPlaces] = useState({ tasks: {}, enquiries: {} });
  useEffect(() => {
    let live = true;
    productionApi.queuePlaces().then((data) => live && setPlaces(data || { tasks: {}, enquiries: {} })).catch(() => {});
    return () => { live = false; };
  }, []);
  return places;
}

/** The places for a task: its own (a queue task), else the queue tasks of its enquiry or job. */
export const placesForTask = (places, task) => {
  const own = places.tasks?.[task?._id];
  if (own) return [own];
  const job = task?.enquiry?._id || task?.enquiry || task?.chain || null;
  return job ? places.enquiries?.[job] || [] : [];
};
