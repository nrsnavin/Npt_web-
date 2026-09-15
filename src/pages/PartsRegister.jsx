import { useState } from 'react';
import { Link } from 'react-router-dom';
import { components as componentsApi, downloads } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Modal, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import PartForm, { KINDS } from '../components/PartForm.jsx';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import { formatDate } from '../utils/format.js';

/**
 * The hook, clip and print registers.
 *
 * One component rendering three screens, because they are the same register with a different
 * noun on it — same fields, same rules, same people keeping them. Three near-identical pages is
 * three places for a column to be added twice and a fix to be applied once.
 *
 * Everything here is priced **per piece**, which is the one thing that separates these from the
 * material register beside them: resin is bought by the kilo and needs a grammage conversion, a
 * hook is a hook. The unit is stated on every rate for exactly that reason — two adjacent
 * screens showing a bare "Rate" is how a per-kilo figure lands on a per-piece line.
 *
 * The words each register puts on the shape live with the form, in `KINDS`, so the list and the
 * form cannot come to call the same thing two different nouns.
 */

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/** A rate nobody has confirmed in a season is not wrong, but it is worth a second look. */
const STALE_DAYS = 90;
const isStale = (at) =>
  at ? (Date.now() - new Date(at).getTime()) / 86400000 > STALE_DAYS : false;


export default function PartsRegister({ kind }) {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [active, setActive] = useState('');
  const { sort, toggle } = useSort();

  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };

  const copy = KINDS[kind];
  const term = useDebounced(search);
  /* `kind` is not a filter here, it is which register this is — so it is always sent. */
  const filters = { kind, search: term || undefined, isActive: active || undefined };
  const { data, pagination, loading, error, reload } = useRecordList(componentsApi.list, {
    ...filters,
    sort: sort || undefined,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('materials');

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.components} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setEditing({})}>
                + New {copy.one}
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search name, code, colour or supplier…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {/*
          Retired parts stay on the register because old costings still point at them, so the
          list carries rows nobody will fit again. The API already understood this filter.
        */}
        <select
          className="input w-44"
          value={active}
          aria-label="In use"
          onChange={(event) => {
            setActive(event.target.value);
            setPage(1);
          }}
        >
          <option value="">In use and retired</option>
          <option value="true">In use only</option>
          <option value="false">Retired only</option>
        </select>
      </div>

      {loading && <TableSkeleton columns={5} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title={`Nothing on the ${copy.one} register yet`}
          description="Add what the plant fits, and a costing can pick it instead of typing a rate."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <SortHeader field="name" label="Name" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="colour" label="Colour" sort={sort} onToggle={sortBy} className="px-4" />
                    {/* The unit in the header, so no column here reads as a per-kilo rate. */}
                    <SortHeader field="ratePerPiece" label="Rate / pc" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    <SortHeader field="supplier" label="Supplier" sort={sort} onToggle={sortBy} className="px-4" />
                    {/* Oldest first is the housekeeping list: a price nobody has confirmed
                        lately is a costing quietly out of date. */}
                    <SortHeader field="rateUpdatedAt" label="Confirmed" sort={sort} onToggle={sortBy} className="px-4" />
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((part) => (
                    <tr key={part._id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/${kind}s/${part._id}`}
                          className="font-semibold text-steel-100 transition-colors hover:text-accent"
                        >
                          {part.name}
                        </Link>
                        {part.code && <p className="text-xs text-steel-400">{part.code}</p>}
                      </td>
                      <td className="px-4 py-3.5 text-steel-300">{part.colour || '—'}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-100">
                        {rupees(part.ratePerPiece)}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-steel-400">{part.supplier || '—'}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-xs ${
                            isStale(part.rateUpdatedAt) ? 'text-warn-400' : 'text-steel-400'
                          }`}
                        >
                          {part.rateUpdatedAt ? formatDate(part.rateUpdatedAt) : '—'}
                        </span>
                        {part.isActive === false && <Badge status="inactive" />}
                      </td>
                      {mayWrite && (
                        <td className="px-4 py-3.5 text-right">
                          <button type="button" className="row-action" onClick={() => setEditing(part)}>
                            Edit
                          </button>
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
        title={editing?._id ? editing.name : `New ${copy.one}`}
        description="A costing copies the rate, so changing it here never re-prices a quote already sent"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <PartForm
            kind={kind}
            part={editing._id ? editing : null}
            onClose={() => setEditing(null)}
            onSaved={reload}
          />
        )}
      </Modal>
    </div>
  );
}
