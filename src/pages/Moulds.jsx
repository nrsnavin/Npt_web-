import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloads, moulds as mouldsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Modal, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import { MouldThumb } from '../components/MouldPhoto.jsx';
import MouldForm from '../components/MouldForm.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import { formatCurrency, formatNumber } from '../utils/format.js';
import { formatGrams } from '../utils/grams.js';
import {
  HANGER_CATEGORIES, HOOK_TYPES, MATERIALS, MOULD_STATUSES, optionLabel,
} from '../utils/pipeline.js';

/**
 * The mould register — and the model master [BLUEPRINT §28].
 *
 * There used to be a product catalogue beside this: a screen of model codes with a size, a
 * category, a hook, a minimum, and a hand-ticked `mouldAvailable` box sitting next to the
 * register that already knew the answer. The two disagreed the first week, and every other
 * screen had to decide which of them to believe. The steel is the thing that exists, so the
 * steel is the record, and the catalogue's own fields live on the form below.
 *
 * The screen is still built around the one fact a catalogue of model codes could not hold: a
 * piece weighs one thing and consumes another. Everything to the right of the divider on the
 * form is derived live from the four figures to its left — cavities, part weight, runner
 * weight, cycle — so the person entering them watches the consumption move as they type, and
 * the gap between the part and the resin is visible before the record is saved rather than
 * discovered in a costing.
 *
 * What is *not* here is anything the plant buys in and resells. A traded piece has no tool, so
 * it has no record: it reaches the system as the model number the buyer asked for, on the
 * enquiry and the costing that price it.
 */

const grams = (value) =>
  value === undefined || value === null ? '—' : `${Number(value).toFixed(2)} g`;

export default function Moulds() {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [material, setMaterial] = useState('');
  /* The catalogue's own filter. "What 400 mm shirt hangers do we make" is asked here now. */
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const { sort, toggle } = useSort();

  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };

  const term = useDebounced(search);
  const filters = {
    search: term || undefined,
    status: status || undefined,
    material: material || undefined,
    category: category || undefined,
  };
  const { data, pagination, loading, error, reload } = useRecordList(mouldsApi.list, {
    ...filters,
    sort: sort || undefined,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('moulds');

  const onFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Models & moulds"
        subtitle="Every tool on the floor — the model it makes, and what a piece off it actually consumes"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.moulds} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setEditing({})}>
                + New mould
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search mould number, name or press…"
          value={search}
          onChange={onFilterChange(setSearch)}
        />
        <select className="input w-40" value={status} onChange={onFilterChange(setStatus)} aria-label="Status">
          <option value="">All statuses</option>
          {MOULD_STATUSES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="input w-44" value={material} onChange={onFilterChange(setMaterial)} aria-label="Resin">
          <option value="">All resins</option>
          {MATERIALS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="input w-44" value={category} onChange={onFilterChange(setCategory)} aria-label="Category">
          <option value="">All categories</option>
          {HANGER_CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {loading && <TableSkeleton columns={9} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No tools match"
          description="Try a different search, or add the mould to the register."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <SortHeader field="mouldCode" label="Mould" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="name" label="Makes" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="moq" label="Minimum" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    <SortHeader field="cavities" label="Cavities" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    <SortHeader field="partWeightGrams" label="Part" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    {/*
                      The two columns that are the point of the register, side by side — and the
                      two that cannot be ordered by. Both are divided out of the cavities, the
                      weights and the cycle time on the way out of the record, so there is
                      nothing stored for the server to rank. Sorting by cavities or by part
                      weight asks most of the same question and gives an honest answer.
                    */}
                    <th className="px-4 py-3 text-right">Consumes</th>
                    <th className="px-4 py-3 text-right">Runner</th>
                    <th className="px-4 py-3 text-right">Pcs/hour</th>
                    <SortHeader field="status" label="Status" sort={sort} onToggle={sortBy} className="px-4" />
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((mould) => {
                    const short = mould.runningCavities < mould.cavities;
                    return (
                      <tr key={mould._id} className="row-hover">
                        {/* The shape beside the code. A register of forty tools is scanned for
                            a hanger, not for a string — and until now it was all strings. */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <MouldThumb mould={mould} />
                            <div className="min-w-0">
                              {/* The code is the way in. A register row answers "does this tool
                                  exist"; everything else anybody asks of a mould is one page
                                  further on. */}
                              <Link
                                to={`/moulds/${mould._id}`}
                                className="font-semibold text-steel-100 transition-colors hover:text-accent"
                              >
                                {mould.mouldCode}
                              </Link>
                              <p className="text-xs text-steel-400">{mould.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-steel-300">
                          {[
                            optionLabel(HANGER_CATEGORIES, mould.category),
                            mould.sizeMm ? `${mould.sizeMm} mm` : null,
                            optionLabel(HOOK_TYPES, mould.hookType),
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-300">
                          {mould.moq ? formatNumber(mould.moq) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          <span className={short ? 'text-warn-400' : 'text-steel-200'}>
                            {mould.runningCavities}
                          </span>
                          <span className="text-steel-500">/{mould.cavities}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-300">
                          {formatGrams(mould.partWeightGrams)}
                        </td>
                        {/*
                          Lit, because it is the number a costing should start from and the one
                          people reach past to the part weight beside it.
                        */}
                        <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-flame-400">
                          {formatGrams(mould.consumptionPerPieceGrams)}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-300">
                          {mould.runnerPercent}%
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                          {formatNumber(mould.piecesPerHour)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge status={mould.status} />
                            {mould.ownedBy === 'customer' && <Badge tone="info">Customer's</Badge>}
                            {mould.isActive === false && <Badge status="inactive" />}
                          </div>
                        </td>
                        {mayWrite && (
                          <td className="px-4 py-3.5 text-right">
                            <button type="button" className="row-action" onClick={() => setEditing(mould)}>
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      ))}

      <Modal
        open={Boolean(editing)}
        title={editing?._id ? `Mould ${editing.mouldCode}` : 'New mould'}
        description="Consumption, output and machine cost are derived — only what is measured is entered"
        onClose={() => setEditing(null)}
        size="lg"
      >
        {editing && (
          <MouldForm
            mould={editing._id ? editing : null}
            onClose={() => setEditing(null)}
            onSaved={reload}
          />
        )}
      </Modal>
    </div>
  );
}
