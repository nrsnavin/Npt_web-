import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { tradedItems as tradedItemsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Facts, Modal, PageHeader, Section, Spinner } from '../components/ui.jsx';
import TradedItemForm from '../components/TradedItemForm.jsx';
import { formatDate } from '../utils/format.js';
import { HANGER_CATEGORIES, optionLabel } from '../utils/pipeline.js';

const rupees = (value) => (value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`);

/**
 * One bought-in item: what it is, what we pay and how that has moved, and the quotations
 * costed on it — with how many were costed on a price that has since changed.
 */
export default function TradedItemDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const mayKeep = canWrite('pricing');
  const fetch = useCallback(() => tradedItemsApi.get(id), [id]);
  const { data: item, loading, error, reload } = useRecord(fetch, id);
  const [editing, setEditing] = useState(false);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    if (!mayKeep) return;
    tradedItemsApi.quotations(id).then(setUsage).catch(() => setUsage(null));
  }, [id, mayKeep, item?.inwardPrice]);

  if (loading && !item) return <Spinner label="Loading the item" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!item) return null;

  const history = [...(item.priceHistory || [])].reverse();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={item.modelNumber}
        subtitle={<Link to="/trading" className="hover:text-accent">Trading master</Link>}
        actions={
          <div className="flex items-center gap-2">
            {item.isActive === false && <Badge status="inactive" />}
            {mayKeep && <button type="button" className="btn-primary" onClick={() => setEditing(true)}>Edit</button>}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Section title="The item">
            <Facts
              items={[
                { label: 'Code', value: item.code },
                { label: 'Description', value: item.description, wide: true },
                { label: 'Category', value: item.category && optionLabel(HANGER_CATEGORIES, item.category) },
                { label: 'Size', value: item.sizeMm && `${item.sizeMm} mm` },
                { label: 'Colour', value: item.colour },
                { label: 'Material', value: item.material },
                { label: 'Supplier', value: item.supplier },
                { label: "Supplier's code", value: item.supplierItemCode },
                { label: 'MOQ', value: item.moq },
                { label: 'Pcs per carton', value: item.piecesPerCarton },
                { label: 'HSN', value: item.hsnCode },
                { label: 'GST', value: item.gstPercent != null ? `${item.gstPercent}%` : undefined },
                { label: 'Notes', value: item.notes, wide: true },
              ]}
            />
          </Section>

          {usage && (
            <Section title={`Quotations costed on it (${usage.rows.length})`}>
              {usage.stale > 0 && (
                <p className="mb-3 rounded-lg bg-warn-500/10 px-3 py-2 text-sm text-warn-400">
                  {usage.stale} quotation{usage.stale === 1 ? ' was' : 's were'} costed on a different inward price
                  than today’s — worth a re-cost before the next one goes out.
                </p>
              )}
              {usage.rows.length ? (
                <ul className="divide-y divide-line/[0.05]">
                  {usage.rows.map((row) => {
                    const lines = (row.lines || []).filter((line) => String(line.tradedItem) === String(item._id));
                    const costedAt = lines[0]?.cost?.inwardPrice;
                    return (
                      <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div>
                          <Link to={`/quotations/${row._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.number}</Link>
                          <span className="ml-2 text-xs text-steel-400">{row.customer?.name}</span>
                        </div>
                        <span className={`text-xs tabular-nums ${costedAt !== item.inwardPrice ? 'text-warn-400' : 'text-steel-400'}`}>
                          Costed at {rupees(costedAt)} · {row.status}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-steel-500">No quotation has been costed on this item yet.</p>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-5">
          {item.inwardPrice !== undefined ? (
            <Section title="Inward price">
              <p className="text-3xl font-bold tabular-nums text-steel-50">{rupees(item.inwardPrice)}</p>
              <p className="mt-1 text-xs text-steel-500">
                per piece · confirmed {item.priceUpdatedAt ? formatDate(item.priceUpdatedAt) : '—'}
              </p>
              {history.length > 0 && (
                <ol className="mt-4 space-y-2.5 border-t border-line/[0.06] pt-3">
                  {history.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} className="text-sm">
                      <p className="font-semibold tabular-nums text-steel-100">
                        {entry.from != null ? `${rupees(entry.from)} → ` : ''}{rupees(entry.price)}
                      </p>
                      <p className="text-xs text-steel-500">
                        {formatDate(entry.at)} · {entry.source === 'upload' ? 'Uploaded' : 'By hand'}
                        {entry.by?.name ? ` · ${entry.by.name}` : ''}
                      </p>
                      {entry.note && <p className="text-xs text-steel-400">{entry.note}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          ) : (
            <Section title="Inward price">
              <p className="text-sm text-steel-400">Seen by the Quotation department and Admin only.</p>
            </Section>
          )}
        </div>
      </div>

      <Modal open={editing} title={item.modelNumber} size="lg" onClose={() => setEditing(false)}>
        {editing && <TradedItemForm item={item} onClose={() => setEditing(false)} onSaved={reload} />}
      </Modal>
    </div>
  );
}
