import { useCallback } from 'react';
import { history as historyApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { Section, Spinner } from './ui.jsx';
import { formatDate, humanise } from '../utils/format.js';

/**
 * Who changed what, and when.
 *
 * The status strip on each screen already says how a record moved through its stages, which
 * is the part the process cares about. This is the part a dispute cares about: somebody
 * shortened a required date or dropped a credit term, and three weeks later nobody can say
 * who. A stage history cannot answer that, because none of those are stages.
 *
 * Read-only and quiet by design — a panel at the bottom of the screen, not a feed competing
 * for attention with the record itself.
 */

/**
 * Words the general rule gets wrong.
 *
 * Splitting camelCase and title-casing handles nearly everything, but it turns `whatsapp`
 * into "Whatsapp" and `gstin` into "Gstin" — and every other screen in the app writes
 * "WhatsApp" and "GST number". A panel whose whole job is to be trusted about detail should
 * not be the one place spelling the customer's own fields differently.
 */
const NAMED = {
  gstin: 'GST number',
  whatsapp: 'WhatsApp',
  moq: 'MOQ',
  sizeMm: 'Size (mm)',
  creditTermsDays: 'Credit terms (days)',
  standardWeightGrams: 'Standard weight (g)',
};

/** `requirement.modelNumber` → "Requirement › Model number", which is how the form reads. */
const fieldLabel = (path) =>
  String(path)
    .split('.')
    .map((segment) => NAMED[segment] || humanise(segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2')))
    .join(' › ');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

/**
 * A stored value as a reader would say it.
 *
 * References arrive already resolved to names — the server does that on the way out, since
 * the log itself keeps ids. What is left is scalars, dates and the occasional list.
 */
function readable(value) {
  if (value === null || value === undefined || value === '') return 'nothing';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length ? value.map(readable).join(', ') : 'nothing';
  if (typeof value === 'string' && ISO_DATE.test(value)) return formatDate(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const ACTIONS = {
  created: 'created this',
  transferred: 'handed this over',
  deleted: 'deleted this',
};

/** The full timestamp, since "who changed the date" is usually asked about a specific day. */
const when = (at) =>
  new Date(at).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function Entry({ row }) {
  return (
    <li className="border-l border-line/[0.08] py-3 pl-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-steel-100">{row.by?.name || 'The system'}</span>
        <span className="text-sm text-steel-400">{ACTIONS[row.action] || 'edited this'}</span>
        <span className="ml-auto text-xs tabular-nums text-steel-500">{when(row.at)}</span>
      </div>

      {row.note && <p className="mt-1 text-xs text-steel-400">{row.note}</p>}

      {Boolean(row.changes?.length) && (
        <ul className="mt-2 space-y-1">
          {row.changes.map((change) => (
            <li key={change.field} className="text-xs leading-relaxed text-steel-400">
              <span className="font-semibold text-steel-300">{fieldLabel(change.field)}</span>{' '}
              <span className="text-steel-500 line-through">{readable(change.from)}</span>
              {' → '}
              <span className="text-steel-200">{readable(change.to)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * `model` is the server's own name for the record type — Customer, Lead, Enquiry, Sample,
 * Product — because the history route is one route across all of them.
 */
export default function HistoryPanel({ model, id, title = 'Change history' }) {
  const fetch = useCallback((recordId) => historyApi({ model, id: recordId }), [model]);
  const { data, loading, error } = useRecord(fetch, id);

  /*
   * A history that cannot be loaded is not worth an error state. Nothing on this screen
   * depends on it, and a red panel under a record that is otherwise fine reads as though
   * something is wrong with the record.
   */
  if (error) return null;
  if (loading) {
    return (
      <Section title={title}>
        <Spinner label="Loading history" />
      </Section>
    );
  }
  if (!data?.length) {
    return (
      <Section title={title}>
        <p className="text-sm text-steel-500">
          Nothing has been changed since this was created.
        </p>
      </Section>
    );
  }

  return (
    <Section title={title}>
      <ul className="space-y-1">
        {data.map((row) => (
          <Entry key={row._id} row={row} />
        ))}
      </ul>
      {data.length >= 50 && (
        <p className="mt-3 text-xs text-steel-500">Showing the 50 most recent changes.</p>
      )}
    </Section>
  );
}
