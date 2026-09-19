import { useCallback } from 'react';
import { customers as customersApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { ErrorState, Spinner } from './ui.jsx';
import MindMap from './MindMap.jsx';
import { statusTone } from '../utils/statusStyles.js';
import { humanise, plural } from '../utils/format.js';

/**
 * One buyer's whole relationship as a map [§2].
 *
 * The question this answers and the tables below it cannot: **where has this buyer got to.**
 * Every fact is already on the customer screen — two enquiries, one of them sampled, the sample
 * approved, a costing raised and a quotation sent — but as separate tables, so the reader
 * assembles the shape in their head every time. That is the work the picture does.
 *
 * The branches are in the order the work actually happens, left to right through the business:
 * where they came from, what they asked for, what was made for them to look at, what we quoted,
 * and what is being asked about them. A reader scanning for "how far did this get" is scanning
 * down that order, so the map should not reorder itself by count or by recency.
 *
 * **A branch the reader has no grant for is simply absent.** The server sends no rows and no
 * count, and this draws nothing — not a greyed node, because a node saying "8 receivables you
 * may not open" hands over the fact it is meant to be withholding.
 */

/**
 * The branches, in business order rather than in the order the server happens to list them.
 *
 * `to` is where a node opens. The branch itself opens the filtered list, the leaf opens the
 * record — which makes the map a way of navigating rather than only a way of looking, and is
 * most of why it is worth having on a screen somebody works from.
 */
const STRANDS = [
  { key: 'leads', label: 'Came from', tone: 'neutral', at: (id) => `/leads/${id}`, list: null },
  { key: 'enquiries', label: 'Enquiries', tone: 'info', at: (id) => `/enquiries/${id}`, list: '/enquiries' },
  { key: 'samples', label: 'Samples', tone: 'progress', at: (id) => `/samples/${id}`, list: '/samples' },
  { key: 'quotations', label: 'Quotations', tone: 'info', at: (id) => `/quotations/${id}`, list: '/quotations' },
  { key: 'queries', label: 'Queries', tone: 'accent', at: (id) => `/queries/${id}`, list: '/queries' },
];

/*
 * Orders, consignments and receivables are deliberately not on that list any more.
 *
 * The server still gathers them — the API keeps all three, and a reader with those grants still
 * gets the rows — but this application has no screens for them, so a node reading "SO-2026-0006"
 * would be a link to a route that does not exist. Dropping them here rather than asking the
 * server to stop sending them keeps the two decisions separate: what the business records, and
 * what this app shows.
 */

export default function CustomerMap({ customer, name }) {
  const fetch = useCallback((id) => customersApi.map(id), []);
  const { data, loading, error, reload } = useRecord(fetch, customer);

  if (loading) return <Spinner label="Drawing the map" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const branches = STRANDS.flatMap((strand) => {
    const rows = data[strand.key] || [];
    const total = data.totals?.[strand.key] ?? rows.length;

    /*
     * Nothing to show and nothing to say. An empty branch on a map is a stub that reads as a
     * loading failure, and "0 samples" is a fact the list view already states in words.
     */
    if (!rows.length) return [];

    const leaves = rows.map((row) => ({
      key: row.id,
      label: row.label,
      /* The state is what a reader is actually scanning for, so it beats the model number to
         the visible line when a row carries both. */
      sublabel: row.status ? humanise(row.status) : row.sublabel,
      tone: statusTone(row.status),
      to: strand.at(row.id),
    }));

    /*
     * What is not on the map, said on the map. Six is enough to see a shape and a seventh row
     * would start a wall — but a branch that silently showed six of nineteen would be the
     * screen disagreeing with the business, which is the bug the tables were already fixed for.
     */
    if (total > rows.length && strand.list) {
      leaves.push({
        key: `${strand.key}-more`,
        label: `${total - rows.length} more`,
        sublabel: 'Open the full list',
        tone: 'neutral',
        to: `${strand.list}?customer=${customer}`,
      });
    }

    return [{
      key: strand.key,
      label: strand.label,
      sublabel: plural(total, 'record', 'records'),
      tone: strand.tone,
      to: strand.list ? `${strand.list}?customer=${customer}` : undefined,
      leaves,
    }];
  });

  return (
    <MindMap
      root={{ label: name, sublabel: 'Everything on this buyer', to: undefined }}
      branches={branches}
      emptyLabel={`Nothing has happened on ${name} yet — no enquiries, samples or quotations.`}
    />
  );
}
