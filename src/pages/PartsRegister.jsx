import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { components as componentsApi, downloads } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import ExportButton from '../components/ExportButton.jsx';
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
 */

const KINDS = {
  hook: {
    title: 'Hook register',
    subtitle: 'Every hook the plant fits, at the rate a costing reads',
    one: 'hook',
    placeholder: 'Swivel metal hook',
    codeHint: 'e.g. HK-SWV',
  },
  clip: {
    title: 'Clip register',
    subtitle: 'Every clip the plant fits, at the rate a costing reads',
    one: 'clip',
    placeholder: 'Metal clip pair',
    codeHint: 'e.g. CL-MTL',
  },
  print: {
    title: 'Print register',
    subtitle: 'What a printed piece is charged at, by job',
    one: 'print job',
    placeholder: '1 colour screen',
    codeHint: 'e.g. PR-1C',
  },
};

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/** A rate nobody has confirmed in a season is not wrong, but it is worth a second look. */
const STALE_DAYS = 90;
const isStale = (at) =>
  at ? (Date.now() - new Date(at).getTime()) / 86400000 > STALE_DAYS : false;

function PartForm({ kind, part, onClose, onSaved }) {
  const [error, setError] = useState(null);
  const editing = Boolean(part);
  const copy = KINDS[kind];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: editing ? { ...part } : { isActive: true } });

  const number = (value) =>
    value === '' || value === null || value === undefined ? undefined : Number(value);

  const submit = async (values) => {
    setError(null);
    const payload = {
      name: values.name,
      colour: values.colour || undefined,
      ratePerPiece: number(values.ratePerPiece),
      supplier: values.supplier || undefined,
      isActive: values.isActive,
      notes: values.notes || undefined,
    };

    try {
      onSaved(
        editing
          ? await componentsApi.update({
              id: part._id,
              expectedUpdatedAt: part.updatedAt,
              ...payload,
            })
          : await componentsApi.create({ ...payload, kind, code: values.code || undefined })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={errors.name}>
          <input
            className="input"
            placeholder={copy.placeholder}
            {...register('name', { required: 'A name is required' })}
          />
        </Field>
        {/*
          Unique within this register only — a hook and a clip may both be STD-01 in their own
          stores, and refusing the second would be a rule nobody could see from here.
        */}
        <Field label="Code" hint={editing ? 'Fixed — costings point at it' : copy.codeHint}>
          <input
            className="input uppercase"
            disabled={editing}
            defaultValue={part?.code}
            {...(editing ? {} : register('code'))}
          />
        </Field>
        <Field label="Colour" hint="Where it changes the rate">
          <input className="input" {...register('colour')} />
        </Field>
        {/* The unit is in the label, not implied by the column it sits under. */}
        <Field label="Rate (₹ per piece)" error={errors.ratePerPiece}>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            {...register('ratePerPiece', { required: 'A rate per piece is required' })}
          />
        </Field>
        <Field label="Supplier">
          <input className="input" {...register('supplier')} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-steel-200">
        <input type="checkbox" className="h-4 w-4 accent-flame-500" {...register('isActive')} />
        Still used
      </label>

      <Field label="Notes">
        <textarea rows={2} className="input" {...register('notes')} />
      </Field>

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : `Add the ${copy.one}`}
        </button>
      </div>
    </form>
  );
}

export default function PartsRegister({ kind }) {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const copy = KINDS[kind];
  const term = useDebounced(search);
  /* `kind` is not a filter here, it is which register this is — so it is always sent. */
  const filters = { kind, search: term || undefined };
  const { data, pagination, loading, error, reload } = useRecordList(componentsApi.list, {
    ...filters,
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
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Colour</th>
                    {/* The unit in the header, so no column here reads as a per-kilo rate. */}
                    <th className="px-4 py-3 text-right">Rate / pc</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Confirmed</th>
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((part) => (
                    <tr key={part._id} className="row-hover">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-steel-100">{part.name}</p>
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
