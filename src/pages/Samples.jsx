import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { samples as samplesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecord, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import { CustomerSelect, EnquirySelect, ProductSelect } from '../components/pickers.jsx';
import SampleBoard from '../components/boards/SampleBoard.jsx';
import ViewSwitch from '../components/ViewSwitch.jsx';
import { useViewMode } from '../hooks/useBoard.js';
import { formatDate, formatNumber } from '../utils/format.js';
import {
  HANGER_CATEGORIES, MATERIALS, SAMPLE_PURPOSES, SAMPLE_STAGES, followUpState, numeric,
  optionLabel, sampleStageLabel, text,
} from '../utils/pipeline.js';

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/**
 * The bench: where every request is, and how much of it is late.
 *
 * Overdue is called out per stage rather than as one total, because "three overdue" is not
 * actionable and "three sitting in production required" is.
 */
function Bench({ selected, onSelect }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    samplesApi.pipeline().then(setRows).catch(() => setRows([]));
  }, []);

  const live = rows.filter((row) => row.count > 0 || row.status === selected);
  if (!live.length) return null;

  return (
    <div role="tablist" aria-label="Filter by stage" className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {live.map((row) => {
        const active = selected === row.status;
        return (
          <button
            key={row.status}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(active ? '' : row.status)}
            className={`card-interactive px-3.5 py-3 text-left ${active ? '!border-flame-500/40' : ''}`}
          >
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
              {sampleStageLabel(row.status)}
            </p>
            <p className="mt-1 text-lg font-extrabold tabular-nums leading-none tracking-tight text-steel-50">
              {row.count}
            </p>
            <p className={`mt-1 text-xs tabular-nums ${row.overdue ? 'text-danger-400' : 'text-steel-500'}`}>
              {row.overdue ? `${row.overdue} overdue` : 'on time'}
            </p>
          </button>
        );
      })}
    </div>
  );
}


/**
 * Raising a request by hand.
 *
 * The usual path is the automation — moving an enquiry to sample required raises one — so
 * this is for what that cannot see: a buyer who asks at the counter before anybody writes an
 * enquiry, a customer who phones and asks directly, or an internal trial of a new mould that
 * belongs to nobody. The enquiry is therefore optional, and so is the customer.
 */
function SampleRequestForm({ onClose, onSaved }) {
  const [enquiry, setEnquiry] = useState(undefined);
  const [customer, setCustomer] = useState(undefined);
  const [product, setProduct] = useState(undefined);
  const [error, setError] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { quantity: 5, purpose: 'existing_model' } });

  const modelNumber = watch('modelNumber');
  const standalone = !enquiry;

  const submit = async (values) => {
    setError(null);

    // With an enquiry the requirement comes from it; without one it has to be said here.
    if (standalone && !product && !modelNumber?.trim()) {
      setError({ message: 'Pick a model, or describe what to make.' });
      return;
    }

    try {
      onSaved(
        await samplesApi.create({
          enquiry,
          customer,
          product,
          modelNumber: text(values.modelNumber),
          category: text(values.category),
          material: text(values.material),
          sizeMm: numeric(values.sizeMm),
          colour: text(values.colour),
          printing: text(values.printing),
          quantity: numeric(values.quantity),
          purpose: values.purpose,
          requiredDate: text(values.requiredDate),
          remarks: text(values.remarks),
          standaloneReason: standalone ? text(values.standaloneReason) : undefined,
        })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Enquiry"
          className="sm:col-span-2"
          hint="Leave it standalone if nobody has raised one — it can be attached later"
        >
          <EnquirySelect value={enquiry} onChange={setEnquiry} customer={customer} aria-label="Enquiry" />
        </Field>

        {standalone && (
          <>
            <Field
              label="Customer"
              className="sm:col-span-2"
              hint="Not in the list? Add them here. Leave it as an internal trial if there is no buyer."
            >
              <CustomerSelect
                value={customer}
                onChange={setCustomer}
                // Named as a decision, not a prompt: no customer is a legitimate answer here,
                // and "Select a customer…" reads like a field waiting to be filled.
                emptyLabel="No customer — internal trial"
                aria-label="Customer"
              />
            </Field>
            <Field label="Why, without an enquiry" className="sm:col-span-2">
              <input
                className="input"
                placeholder="Asked for one at the counter"
                {...register('standaloneReason')}
              />
            </Field>
          </>
        )}
      </div>

      {standalone && (
        <div className="space-y-5 rounded-lg border border-line/[0.06] p-4">
          <p className="text-sm text-steel-400">
            With no enquiry to take it from, the bench needs to be told what to make.
          </p>

          <Field label="Model" hint="From the catalogue, or describe it below">
            <ProductSelect value={product} onChange={setProduct} aria-label="Model" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Model reference" className="sm:col-span-2">
              <input className="input" placeholder="Matte 400mm white" {...register('modelNumber')} />
            </Field>
            <Field label="Category">
              <select className="input" {...register('category')}>
                <option value="">—</option>
                {HANGER_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Material">
              <select className="input" {...register('material')}>
                <option value="">—</option>
                {MATERIALS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Size (mm)">
              <input type="number" className="input" {...register('sizeMm')} />
            </Field>
            <Field label="Colour">
              <input className="input" {...register('colour')} />
            </Field>
            <Field label="Printing" className="sm:col-span-2">
              <input className="input" {...register('printing')} />
            </Field>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantity" error={errors.quantity}>
          <input type="number" className="input" {...register('quantity', { required: 'How many?' })} />
        </Field>
        <Field label="Purpose">
          <select className="input" {...register('purpose')}>
            {SAMPLE_PURPOSES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Required by" className="sm:col-span-2" hint="A week from today if left empty">
          <input type="date" className="input" {...register('requiredDate')} />
        </Field>
      </div>

      <Field label="Remarks">
        <textarea rows={2} className="input" {...register('remarks')} />
      </Field>

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Raising…' : 'Raise request'}
        </button>
      </div>
    </form>
  );
}

/** What the list hook fetches while the board is showing — see the note on the enquiry list. */
const idle = async () => ({ data: [], pagination: null });

export default function Samples() {
  const { user, canWrite } = useAuth();
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useViewMode('samples');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('open');
  const [page, setPage] = useState(1);

  /*
   * Fetched alongside the page rather than derived here: what counts as stalled — which
   * activity restarts the clock, and that a weekend is not a working day — is a rule with
   * enough in it to be worth having in exactly one place, and that place is the server.
   */
  const stalledFetch = useCallback(() => samplesApi.anomalies(), []);
  const { data: stalledData } = useRecord(stalledFetch, 'anomalies');
  const stalled = useMemo(
    () => new Map((stalledData?.data || []).map((row) => [row._id, row])),
    [stalledData]
  );

  const term = useDebounced(search);
  const board = mode === 'board';

  /* One object for the table and the board, so switching between them shows the same requests. */
  const filters = {
    search: term || undefined,
    status: status || undefined,
    open: view === 'open' || view === 'overdue' || view === 'unassigned' ? 'true' : undefined,
    overdue: view === 'overdue' ? 'true' : undefined,
    unassigned: view === 'unassigned' ? 'true' : undefined,
    mine: view === 'mine' ? 'true' : undefined,
  };

  const { data, pagination, loading, error, reload } = useRecordList(
    board ? idle : samplesApi.list,
    { ...filters, page, limit: 25 }
  );

  const change = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  // Only someone who works the bench has a personal queue worth filtering to.
  const worksTheBench = user?.department === 'sampling' || user?.role === 'admin';

  const views = [
    { value: 'open', label: 'Open' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'unassigned', label: 'Unassigned' },
    ...(worksTheBench ? [{ value: 'mine', label: 'Mine' }] : []),
    { value: 'all', label: 'All' },
  ];

  const emptyCopy = {
    overdue: 'Nothing is past its required date. That is the whole point.',
    unassigned: 'Every open request has someone on it.',
    mine: 'Nothing assigned to you. Pick something off the unassigned queue.',
  };

  return (
    <div className={
      /*
        * A board wants every column it can get. The table's measure is set for reading rows —
        * a line of text stops being comfortable somewhere around here — but a funnel squeezed
        * into it puts two thirds of itself off the right-hand edge, and the shape of the book
        * is the thing a board exists to show. It still scrolls when it has to; it just does not
        * start out having to.
        */
      board ? 'mx-auto w-full' : 'mx-auto max-w-6xl'
    }>
      <PageHeader
        title="Sampling"
        subtitle="Requests raised from enquiries, through the bench to the customer's answer"
        actions={
          <div className="flex items-center gap-2">
            <ViewSwitch mode={mode} onChange={setMode} boardLabel="Bench board" />
            {/* Marketing raises what a buyer asks for; the bench raises its own trials. */}
            {(canWrite('samples') || canWrite('enquiries')) && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                + New request
              </button>
            )}
          </div>
        }
      />

      {/* Not on the board, where every column already carries its own count. */}
      {!board && <Bench selected={status} onSelect={change(setStatus)} />}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search number, model or colour…"
          value={search}
          onChange={(event) => change(setSearch)(event.target.value)}
        />

        <div role="tablist" aria-label="View" className="tab-track grid-flow-col">
          {views.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              onClick={() => change(setView)(option.value)}
              className="tab py-1.5"
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* The columns are the stage filter on a board — see the enquiry list for the argument. */}
        {!board && (
          <select
            className="input w-52"
            aria-label="Stage"
            value={status}
            onChange={(event) => change(setStatus)(event.target.value)}
          >
            <option value="">All stages</option>
            {SAMPLE_STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>{stage.label}</option>
            ))}
          </select>
        )}
      </div>

      {board && <SampleBoard filters={filters} canMove={canWrite('samples')} />}

      {!board && loading && <TableSkeleton columns={6} />}
      {!board && error && <ErrorState error={error} onRetry={reload} />}

      {!board && !loading && !error && (data.length === 0 ? (
        <EmptyState
          title={view === 'overdue' ? 'Nothing overdue' : 'No sample requests here'}
          description={
            emptyCopy[view] ||
            'A request appears the moment marketing moves an enquiry to sample required.'
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-3">Request</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Model</th>
                    <th className="px-3 py-3">Purpose</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3">Required by</th>
                    <th className="px-3 py-3">With</th>
                    <th className="px-3 py-3">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((sample) => {
                    const due = followUpState(sample.requiredDate);
                    const idle = stalled.get(sample._id);
                    return (
                      <tr key={sample._id} className="row-hover">
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <Link to={`/samples/${sample._id}`} className="font-semibold text-steel-100 hover:text-accent">
                            {sample.number}
                          </Link>
                          {/* Overdue is already shown against the date. This is the other
                              thing: nobody is working on it, which is often true while the
                              date is still comfortably ahead. */}
                          {idle && (
                            <span
                              title={idle.reason}
                              className="ml-1.5 rounded bg-danger-500/15 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-danger-400"
                            >
                              Idle {idle.idleDays}d
                            </span>
                          )}
                          <p className="text-xs text-steel-400">
                            {sample.enquiry?.number || 'No enquiry'}
                          </p>
                        </td>
                        <td className="px-3 py-3.5 text-steel-200">
                          {sample.customer?.name || (
                            <span className="text-xs text-steel-500">Internal</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="text-steel-200">{sample.modelNumber || '—'}</p>
                          {sample.colour && <p className="text-xs text-steel-500">{sample.colour}</p>}
                        </td>
                        <td className="px-3 py-3.5 text-steel-300">
                          {optionLabel(SAMPLE_PURPOSES, sample.purpose)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-200">
                          {formatNumber(sample.quantity)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <p className="text-steel-300">{formatDate(sample.requiredDate)}</p>
                          {due && sample.isOverdue && (
                            <p className={`text-xs ${TONE_TEXT[due.tone]}`}>{due.text}</p>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-steel-300">
                          {sample.assignedTo?.name || (
                            <span className="text-xs text-steel-500">Unassigned</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <Badge status={sample.status}>{sampleStageLabel(sample.status)}</Badge>
                        </td>
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
        open={creating}
        title="New sample request"
        description="An enquiry is optional — a counter request or an internal trial has none"
        size="lg"
        onClose={() => setCreating(false)}
      >
        <SampleRequestForm onClose={() => setCreating(false)} onSaved={reload} />
      </Modal>
    </div>
  );
}
