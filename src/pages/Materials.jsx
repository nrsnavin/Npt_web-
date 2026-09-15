import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloads, materials as materialsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Modal, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import MaterialForm from '../components/MaterialForm.jsx';
import { formatDate } from '../utils/format.js';
import { MATERIAL_TYPES, optionLabel } from '../utils/pipeline.js';

/**
 * The material register.
 *
 * Two numbers do the work here and they are not the same kind of number. The **rate** is a
 * purchase fact that moves every few weeks, and a costing copies it rather than reading through
 * — so changing it here never re-prices a quotation somebody already sent. The **grammage
 * factor** is a physical one that almost never moves: a cavity is a fixed volume, so a denser
 * resin makes a heavier part out of the same tool, and the plant works to HIPS being PP plus
 * 18%. A mould's grammage is recorded on a PP basis, which is why PP and LD sit at zero.
 */

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/** A rate nobody has confirmed in a season is not wrong, but it is worth a second look. */
const STALE_DAYS = 90;
const isStale = (at) =>
  at ? (Date.now() - new Date(at).getTime()) / 86400000 > STALE_DAYS : false;


export default function Materials() {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const { sort, toggle } = useSort();

  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };

  const term = useDebounced(search);
  const filters = { search: term || undefined, type: type || undefined };
  const { data, pagination, loading, error, reload } = useRecordList(materialsApi.list, {
    ...filters,
    sort: sort || undefined,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('materials');

  const onFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Material register"
        subtitle="Every resin the plant buys, at the rate a costing reads"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.materials} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setEditing({})}>
                + New material
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search name, code, colour or supplier…"
          value={search}
          onChange={onFilterChange(setSearch)}
        />
        <select className="input w-44" value={type} onChange={onFilterChange(setType)} aria-label="Polymer">
          <option value="">All polymers</option>
          {MATERIAL_TYPES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No materials match"
          description="Try a different search, or add the resin to the register."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <SortHeader field="name" label="Material" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="type" label="Polymer" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="colour" label="Colour" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="ratePerKg" label="Rate / kg" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    <SortHeader field="grammageFactorPercent" label="Grammage" sort={sort} onToggle={sortBy} align="right" className="px-4" />
                    {/* Oldest first is this register's housekeeping list: a rate nobody has
                        confirmed in months is a costing built on a guess. */}
                    <SortHeader field="rateUpdatedAt" label="Confirmed" sort={sort} onToggle={sortBy} className="px-4" />
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((material) => (
                    <tr key={material._id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/materials/${material._id}`}
                          className="font-semibold text-steel-100 transition-colors hover:text-accent"
                        >
                          {material.name}
                        </Link>
                        {material.code && (
                          <p className="text-xs text-steel-400">{material.code}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-steel-200">
                        {optionLabel(MATERIAL_TYPES, material.type)}
                      </td>
                      <td className="px-4 py-3.5 text-steel-300">{material.colour || '—'}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-100">
                        {rupees(material.ratePerKg)}
                      </td>
                      {/*
                        Lit only when it is not zero. A column of "0%" teaches nothing; the one
                        resin that changes the weight is the one worth catching the eye.
                      */}
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {material.grammageFactorPercent ? (
                          <span className="font-semibold text-flame-400">
                            +{material.grammageFactorPercent}%
                          </span>
                        ) : (
                          <span className="text-steel-500">as PP</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-xs ${
                            isStale(material.rateUpdatedAt) ? 'text-warn-400' : 'text-steel-400'
                          }`}
                        >
                          {material.rateUpdatedAt ? formatDate(material.rateUpdatedAt) : '—'}
                        </span>
                        {material.isActive === false && <Badge status="inactive" />}
                      </td>
                      {mayWrite && (
                        <td className="px-4 py-3.5 text-right">
                          <button type="button" className="row-action" onClick={() => setEditing(material)}>
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
        title={editing?._id ? editing.name : 'New material'}
        description="A costing copies the rate, so changing it here never re-prices a quote already sent"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <MaterialForm
            material={editing._id ? editing : null}
            onClose={() => setEditing(null)}
            onSaved={reload}
          />
        )}
      </Modal>
    </div>
  );
}
