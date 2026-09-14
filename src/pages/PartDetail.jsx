import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { components as componentsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import PartForm, { KINDS } from '../components/PartForm.jsx';
import { formatDate, humanise } from '../utils/format.js';

/**
 * One hook, clip or print job, in full.
 *
 * One page for three registers, like the list and the form beside it — they are the same record
 * with a different noun on it, and three near-identical pages is three places for a fix to be
 * applied once.
 *
 * Everything here is priced **per piece**, which is the one thing separating these from the
 * material register: resin is bought by the kilo and needs a grammage conversion, a hook is a
 * hook. The unit is stated on the rate for exactly that reason — two adjacent screens showing a
 * bare "Rate" is how a per-kilo figure lands on a per-piece line.
 *
 * And as on the material page, what has been costed on this part is shown with it. A costing
 * copies the rate rather than reading through, so the question that follows any rate change is
 * always "what have I not re-costed" — and it deserves an answer rather than a feeling.
 */

const STALE_DAYS = 90;

export default function PartDetail({ kind }) {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const mayEdit = canWrite('materials');
  const copy = KINDS[kind];

  const fetch = useCallback((partId) => componentsApi.get(partId), []);
  const { data, loading, error, reload } = useRecord(fetch, id);
  const [editing, setEditing] = useState(false);
  const [costed, setCosted] = useState(null);

  useEffect(() => {
    let cancelled = false;
    componentsApi
      .pricings(id)
      .then((response) => !cancelled && setCosted(response))
      .catch(() => !cancelled && setCosted({ rows: [], stale: 0 }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <Spinner label={`Loading the ${copy.one}`} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const part = data;
  const stale =
    part.rateUpdatedAt &&
    (Date.now() - new Date(part.rateUpdatedAt).getTime()) / 86400000 > STALE_DAYS;

  const rows = costed?.rows || [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={part.name}
        subtitle={
          <>
            {part.code ? `${part.code} · ` : ''}
            {copy.one}
            {part.colour ? ` · ${part.colour}` : ''}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {mayEdit && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit the {copy.one}
              </button>
            )}
            <Badge status={part.isActive === false ? 'rejected' : 'approved'}>
              {part.isActive === false ? 'Off the register' : 'In use'}
            </Badge>
          </div>
        }
      />

      {stale && (
        <Notice tone="warn">
          Nobody has confirmed this rate since {formatDate(part.rateUpdatedAt)}. Worth a second
          look before it is costed again.
        </Notice>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Section title="What it costs">
            <div className="card px-4 py-3">
              <p className="eyebrow">Rate</p>
              <p className="stat-value mt-1 text-steel-50">
                ₹{Number(part.ratePerPiece).toFixed(2)}
                {/* Said on the rate itself, not in a column heading two screens away. */}
                <span className="ml-1 text-sm font-semibold text-steel-400">/ piece</span>
              </p>
              <p className="mt-0.5 text-xs text-steel-500">
                {part.rateUpdatedAt
                  ? `Confirmed ${formatDate(part.rateUpdatedAt)}`
                  : 'Never confirmed'}
              </p>
            </div>
          </Section>

          <Section title={`Costed with this ${copy.one} (${rows.length})`}>
            {costed === null ? (
              <p className="text-sm text-steel-400">Looking…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-steel-400">
                Nothing has been costed with this {copy.one} yet.
              </p>
            ) : (
              <>
                {costed.stale > 0 && (
                  <p className="mb-3 rounded-lg border border-warn-500/40 bg-warn-500/[0.06] px-3 py-2 text-sm font-semibold text-warn-300">
                    {costed.stale} of these were built on a rate that has since moved. A costing
                    copies the rate rather than reading through it, so changing the figure above
                    left them where they were.
                  </p>
                )}
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <li
                      key={row._id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/[0.06] px-3.5 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/pricings/${row._id}`}
                          className="text-sm font-semibold text-steel-100 hover:text-accent"
                        >
                          {row.number}
                        </Link>
                        <p className="text-xs text-steel-400">
                          {row.customer?.name || 'No customer'}
                          {row.modelNumber ? ` · ${row.modelNumber}` : ''}
                        </p>
                      </div>
                      <Badge status={row.status}>{humanise(row.status)}</Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          {part.notes && (
            <Section title="Notes">
              <p className="whitespace-pre-wrap text-sm text-steel-200">{part.notes}</p>
            </Section>
          )}
        </div>

        <div className="space-y-5">
          <Section title={`This ${copy.one}`}>
            <Facts
              columns={1}
              items={[
                { label: 'Code', value: part.code },
                { label: 'Colour', value: part.colour },
                { label: 'Supplier', value: part.supplier },
                {
                  label: 'Rate last confirmed',
                  value: part.rateUpdatedAt ? formatDate(part.rateUpdatedAt) : null,
                },
              ]}
            />
          </Section>
        </div>
      </div>

      <Modal
        open={editing}
        title={`Edit ${part.name}`}
        description="The same form the register uses, so there is one place a field can be wrong"
        onClose={() => setEditing(false)}
      >
        <PartForm
          kind={kind}
          part={part}
          onClose={() => setEditing(false)}
          onSaved={reload}
        />
      </Modal>
    </div>
  );
}
