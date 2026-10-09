import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloads, tradedItems as tradedItemsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Modal, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import TradedItemForm from '../components/TradedItemForm.jsx';
import TradingUpload from '../components/TradingUpload.jsx';
import { formatDate } from '../utils/format.js';
import { HANGER_CATEGORIES, optionLabel } from '../utils/pipeline.js';

/**
 * The trading master [server: models/TradedItem.js]: what the plant buys in finished and
 * resells, at the inward price a quotation line for it is costed on.
 *
 * Kept by the Quotation department and Admin — by hand, or by uploading the supplier's list.
 * Everyone who quotes sees the items; the price column is theirs only.
 */

const rupees = (value) => (value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`);

/** A price nobody has confirmed in a season is worth a second look before it is quoted on. */
const STALE_DAYS = 90;
const isStale = (at) => (at ? (Date.now() - new Date(at).getTime()) / 86400000 > STALE_DAYS : false);

export default function TradingMaster() {
  const { canWrite } = useAuth();
  /* Keeping the list is costing work: the same grant that sees the cost on a quotation. */
  const mayKeep = canWrite('pricing');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('true');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(null);
  const { sort, toggle } = useSort();

  const term = useDebounced(search);
  const filters = { search: term || undefined, isActive: active || undefined };
  const { data, pagination, loading, error, reload } = useRecordList(tradedItemsApi.list, {
    ...filters, sort: sort || undefined, page, limit: 25,
  });

  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };
  const seesPrice = data.some((item) => item.inwardPrice !== undefined) || mayKeep;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Trading master"
        subtitle="What the plant buys in and resells, at the inward price a quotation is costed on"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButton download={downloads.tradedItems} params={filters} />
            {mayKeep && (
              <>
                <button type="button" className="btn-secondary" onClick={() => setUploading(true)}>
                  Upload Excel / CSV
                </button>
                <button type="button" className="btn-primary" onClick={() => setEditing({})}>
                  + New item
                </button>
              </>
            )}
          </div>
        }
      />

      {done && (
        <p className="mb-4 rounded-lg bg-success-500/10 px-3 py-2 text-sm text-success-400">
          Imported: {done.created} new, {done.updated} updated
          {done.summary?.error ? ` — ${done.summary.error} row(s) refused and skipped` : ''}.
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search model, code, supplier…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="input w-44"
          aria-label="In use"
          value={active}
          onChange={(event) => {
            setActive(event.target.value);
            setPage(1);
          }}
        >
          <option value="true">Still bought</option>
          <option value="false">Retired</option>
          <option value="">All</option>
        </select>
      </div>

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title={term ? 'No items match' : 'Nothing on the trading master yet'}
          description={mayKeep
            ? 'Add a bought-in item, or upload the supplier’s price list as Excel or CSV.'
            : 'The Quotation department keeps this list.'}
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <SortHeader field="modelNumber" label="Model" sort={sort} onToggle={sortBy} className="px-4" />
                    <th className="px-4 py-3">Description</th>
                    <SortHeader field="supplier" label="Supplier" sort={sort} onToggle={sortBy} className="px-4" />
                    {seesPrice && <SortHeader field="inwardPrice" label="Inward price" sort={sort} onToggle={sortBy} align="right" className="px-4" />}
                    {seesPrice && <SortHeader field="priceUpdatedAt" label="Confirmed" sort={sort} onToggle={sortBy} className="px-4" />}
                    {mayKeep && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((item) => (
                    <tr key={item._id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <Link to={`/trading/${item._id}`} className="font-semibold text-steel-100 hover:text-accent">
                          {item.modelNumber}
                        </Link>
                        {item.code && <p className="text-xs text-steel-400">{item.code}</p>}
                        {item.isActive === false && <Badge status="inactive" />}
                      </td>
                      <td className="max-w-[18rem] px-4 py-3.5 text-steel-300">
                        {[item.description, optionLabel(HANGER_CATEGORIES, item.category), item.colour].filter((text) => text && text !== '—').join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-steel-300">{item.supplier || '—'}</td>
                      {seesPrice && (
                        <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-steel-50">{rupees(item.inwardPrice)}</td>
                      )}
                      {seesPrice && (
                        <td className="px-4 py-3.5">
                          <span className={`text-xs ${isStale(item.priceUpdatedAt) ? 'text-warn-400' : 'text-steel-400'}`}>
                            {item.priceUpdatedAt ? formatDate(item.priceUpdatedAt) : '—'}
                          </span>
                        </td>
                      )}
                      {mayKeep && (
                        <td className="px-4 py-3.5 text-right">
                          <button type="button" className="row-action" onClick={() => setEditing(item)}>Edit</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      ))}

      <Modal
        open={Boolean(editing)}
        title={editing?._id ? editing.modelNumber : 'New bought-in item'}
        description="A quotation copies the inward price when it is costed, so changing it here never re-prices a quote already sent"
        size="lg"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <TradedItemForm item={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={reload} />
        )}
      </Modal>

      <Modal
        open={uploading}
        title="Upload the trading master"
        description="See what would change first; nothing is written until you import"
        size="lg"
        onClose={() => setUploading(false)}
      >
        {uploading && (
          <TradingUpload
            onClose={() => setUploading(false)}
            onDone={(result) => {
              setDone(result);
              reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
