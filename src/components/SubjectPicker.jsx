import { useEffect, useState } from 'react';
import { taskQueries } from '../api/endpoints.js';

/**
 * The subject of a query, from the shared list [server: querySubjects.service] — Accounts issue,
 * Sample, Dispatch, Production status… — or a new one typed in, which joins the list for everyone
 * when the query is sent. Used by both kinds of query: a buyer's thread and a question on a task.
 */
const NEW = '__new__';

let cached = null;
export function useQuerySubjects() {
  const [subjects, setSubjects] = useState(cached || []);
  useEffect(() => {
    let live = true;
    taskQueries.subjects().then((rows) => {
      cached = rows;
      if (live) setSubjects(rows);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return subjects;
}

/** Forget the list, so the next picker reads it fresh — after a subject is added, renamed or removed. */
export const forgetQuerySubjects = () => { cached = null; };

export default function SubjectPicker({ value, onChange, id = 'query-subject', required = false }) {
  const subjects = useQuerySubjects();
  const known = !value || subjects.some((row) => row.name === value);
  const [typing, setTyping] = useState(false);
  const adding = typing || (!known && value);
  return (
    <div className="space-y-2">
      <select
        id={id}
        className="input"
        aria-label="Subject"
        required={required && !adding}
        value={adding ? NEW : value || ''}
        onChange={(event) => {
          if (event.target.value === NEW) {
            setTyping(true);
            onChange('');
          } else {
            setTyping(false);
            onChange(event.target.value);
          }
        }}
      >
        <option value="">Choose a subject…</option>
        {subjects.map((row) => <option key={row._id} value={row.name}>{row.name}</option>)}
        <option value={NEW}>+ Add a new subject…</option>
      </select>
      {adding && (
        <input
          className="input"
          aria-label="New subject"
          placeholder="Name the subject — it is added to the list for everyone"
          maxLength={60}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus
          required={required}
        />
      )}
    </div>
  );
}
