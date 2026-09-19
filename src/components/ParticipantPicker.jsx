import { useEffect, useState } from 'react';
import { queries as queriesApi } from '../api/endpoints.js';
import { Field } from './ui.jsx';

/**
 * Choosing who to ask: a department, or one person inside it.
 *
 * Two controls rather than one flat list of everybody, because they are two different acts. "Ask
 * despatch" is the usual one and the one that survives leave and shift changes — anybody in the
 * department sees it. "Ask Ramesh, he was there when the mould was cut" is the other, and it
 * *narrows*: it does not also reach his colleagues. A single list of names would quietly turn
 * every question into the second kind, which is how a thread dies while the one person who could
 * have answered it is away.
 *
 * So the department comes first and the person is a refinement of it, which is also the shape
 * the server stores: a participant always carries a department, optionally narrowed to a user.
 *
 * The options come from the server rather than from the department list in this bundle, because
 * the question is not "what departments exist" but "who works in each, today". A picker built
 * from a constant offers people who have left.
 */

/** What a chosen row means, said in words — used on the chips and in the confirmation. */
export const describeParticipant = (row, options) => {
  const department = options.find((entry) => entry.key === row.department);
  const label = department?.label || row.department;

  if (!row.user) return `Anyone in ${label}`;
  const person = department?.people.find((candidate) => candidate._id === row.user);
  return person ? `${person.name} (${label})` : label;
};

/**
 * Loads the departments and who is in each, once per screen.
 *
 * Shared as a hook because both places that pick a participant — raising a query and widening
 * one — need the same list, and both need it to label what is already there.
 */
export function useParticipantOptions() {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    queriesApi
      .options()
      .then((data) => live && setOptions(data || []))
      /* A picker that cannot load is a form that cannot be filled, and the submit will say so
         plainly. Failing quietly here beats an error banner over a dialog somebody just opened. */
      .catch(() => live && setOptions([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  return { options, loading };
}

/**
 * One row of the picker, plus the button that commits it.
 *
 * `onAdd` receives exactly what the server stores — `{ department }` or `{ user }` — rather than
 * both fields, because a row carrying a person *and* a department that disagree about where they
 * work is a filter that stops finding them. The server resolves a named person's own department;
 * sending the one that happened to be on screen would be the screen's guess overriding the record.
 */
export default function ParticipantPicker({ options, loading, onAdd, disabled, label = 'Ask' }) {
  const [department, setDepartment] = useState('');
  const [person, setPerson] = useState('');

  const chosen = options.find((entry) => entry.key === department);

  const add = () => {
    if (!department) return;
    onAdd(person ? { user: person } : { department });
    /* The department stays. Adding "despatch" and then "Kavitha in despatch" is a real sequence,
       and resetting both would make the second choice a fresh hunt through the list. */
    setPerson('');
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label={label} className="min-w-[10rem] flex-1">
        <select
          className="input"
          value={department}
          disabled={disabled || loading}
          onChange={(event) => {
            setDepartment(event.target.value);
            /* A person from the old department is no longer a possible answer. Clearing is the
               honest move: leaving it would submit somebody nobody meant to name. */
            setPerson('');
          }}
        >
          <option value="">{loading ? 'Loading…' : 'Choose a department…'}</option>
          {options.map((entry) => (
            <option key={entry.key} value={entry.key}>{entry.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Anybody in particular?" className="min-w-[10rem] flex-1">
        <select
          className="input"
          value={person}
          disabled={disabled || !chosen?.people.length}
          onChange={(event) => setPerson(event.target.value)}
        >
          <option value="">
            {chosen ? `Anyone in ${chosen.label}` : 'Choose a department first'}
          </option>
          {(chosen?.people || []).map((candidate) => (
            <option key={candidate._id} value={candidate._id}>{candidate.name}</option>
          ))}
        </select>
      </Field>

      <button type="button" className="btn-secondary mb-0.5" onClick={add} disabled={disabled || !department}>
        Add
      </button>
    </div>
  );
}
