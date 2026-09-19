import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { queries as queriesApi } from '../api/endpoints.js';
import { useRecordList } from '../hooks/useRecords.js';
import { Badge, Section } from './ui.jsx';
import RaiseQuery from './RaiseQuery.jsx';
import { formatDate, plural } from '../utils/format.js';

/**
 * The questions being asked about this buyer, on the buyer's own screen.
 *
 * Where a question actually starts: somebody is looking at SCM Garments because the buyer has
 * rung, and the thing they need is "has anybody sorted the September invoice". Making them find
 * the Queries tab, search for the company and then come back is how a feature ends up used by
 * nobody — and how the question gets asked on WhatsApp instead, which is what this replaces.
 *
 * **It shows the threads the reader is in, and it says so.** A query is private to its room: the
 * participants and whoever asked. Owning a buyer does not put you in every conversation about
 * them, deliberately — despatch and accounts working out between themselves what went wrong is
 * a thread that should not be read over their shoulder by the person who sold the order.
 *
 * That is a real cost: a marketing owner can see an empty panel while two threads about their
 * buyer are live. The honest answer is to label the panel for what it is rather than to let it
 * read as "no questions have been asked" — and the remedy the plant already has is that anybody
 * in a thread can pull the owner in, which takes one press.
 */
export default function CustomerQueries({ customer, name }) {
  const [asking, setAsking] = useState(false);

  const fetch = useCallback((params) => queriesApi.list(params), []);
  /* The recent few. The full list, filtered to this buyer, is one link away. */
  const { data, pagination, loading, reload } = useRecordList(fetch, {
    customer,
    limit: 5,
    /* Never read for filters: there is no phrase here, and a panel is not a search box. */
    ai: 'false',
  });

  const total = pagination?.total ?? data.length;

  return (
    <Section
      title={`Queries you are in${total ? ` (${total})` : ''}`}
      actions={
        <button type="button" className="btn-secondary" onClick={() => setAsking(true)}>
          Ask a question
        </button>
      }
    >
      {loading ? (
        <p className="text-sm text-steel-500">Loading…</p>
      ) : !data.length ? (
        <p className="text-sm leading-relaxed text-steel-500">
          You are not in any query about {name}. Others may be — a thread is private to whoever
          was asked.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.map((row) => (
            <li key={row._id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to={`/queries/${row._id}`}
                  className="text-sm font-semibold text-steel-100 hover:text-accent"
                >
                  {row.subject}
                </Link>
                <p className="text-xs text-steel-500">
                  {row.number} · asked by {row.raisedBy?.name || 'somebody'} on{' '}
                  {formatDate(row.createdAt)}
                  {row.replyCount > 0 ? ` · ${plural(row.replyCount, 'reply', 'replies')}` : ''}
                </p>
              </div>
              <Badge status={row.status} />
            </li>
          ))}
        </ul>
      )}

      {total > data.length && (
        <Link className="link mt-4 inline-block text-sm" to={`/queries?customer=${customer}`}>
          Every query you are in about {name}
        </Link>
      )}

      <RaiseQuery
        open={asking}
        customer={customer}
        onClose={() => setAsking(false)}
        onRaised={reload}
      />
    </Section>
  );
}
