import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customers as customersApi } from '../api/endpoints.js';
import { Badge, EmptyState, Notice, TableSkeleton } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * Everything about one buyer on one scroll — enquiries, samples, costings, quotations, orders,
 * dispatches and questions, newest first, a page at a time. The server decides what this person
 * may see of it; the screen only draws.
 */
const KIND = {
  enquiry: { mark: 'E', tone: 'bg-aqua-500/15 text-aqua-300', label: 'Enquiry' },
  sample: { mark: 'S', tone: 'bg-success-500/15 text-success-400', label: 'Sample' },
  costing: { mark: '₹', tone: 'bg-warn-500/15 text-warn-400', label: 'Costing' },
  quotation: { mark: 'Q', tone: 'bg-flame-500/15 text-flame-400', label: 'Quotation' },
  order: { mark: 'O', tone: 'bg-line/[0.08] text-steel-200', label: 'Order' },
  dispatch: { mark: 'D', tone: 'bg-line/[0.08] text-steel-200', label: 'Dispatch' },
  query: { mark: '?', tone: 'bg-aqua-500/15 text-aqua-300', label: 'Question' },
};

/** Months as headings, so a long history reads in chapters rather than as one column of dates. */
const monthOf = (at) => new Date(at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export default function CustomerTimeline({ customerId }) {
  const [events, setEvents] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (before) => {
      setLoading(true);
      setError(null);
      try {
        const page = await customersApi.timeline({ id: customerId, before });
        setEvents((current) => (before ? [...current, ...page.data] : page.data));
        setNext(page.next);
      } catch (failure) {
        setError(failure);
      } finally {
        setLoading(false);
      }
    },
    [customerId]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !events.length) return <TableSkeleton rows={6} columns={3} />;
  if (error && !events.length) return <Notice tone="danger">{error.message}</Notice>;
  if (!events.length) {
    return <EmptyState title="Nothing yet" description="Enquiries, samples, quotes, orders and questions for this buyer will line up here." />;
  }

  let month = null;
  return (
    <div className="card p-5">
      <ol className="relative">
        {events.map((event) => {
          const kind = KIND[event.kind] || KIND.order;
          const heading = monthOf(event.at);
          const newMonth = heading !== month;
          month = heading;
          const body = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-steel-100">{event.title}</span>
                <span className="block text-xs text-steel-500">
                  {kind.label} · {formatDate(event.at)}
                </span>
              </span>
              {event.status && <Badge status={event.status} />}
            </>
          );
          return (
            <li key={event.id}>
              {newMonth && (
                <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.08em] text-steel-500 first:mt-0">{heading}</p>
              )}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${kind.tone}`}>
                    {kind.mark}
                  </span>
                  <span aria-hidden className="w-px flex-1 bg-line/[0.08]" />
                </div>
                {event.link ? (
                  <Link to={event.link} className="-mt-0.5 mb-3 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-line/[0.04]">
                    {body}
                  </Link>
                ) : (
                  <div className="-mt-0.5 mb-3 flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5">{body}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {next && (
        <div className="mt-2 text-center">
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => load(next)}>
            {loading ? 'Loading…' : 'Show earlier'}
          </button>
        </div>
      )}
    </div>
  );
}
