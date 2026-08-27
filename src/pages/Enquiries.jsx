import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { downloads, enquiries as enquiriesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import EnquiryFields from '../components/EnquiryFields.jsx';
import { CustomerSelect } from '../components/pickers.jsx';
import BulkBar, { RowCheckbox, useSelection } from '../components/BulkReassign.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { formatCompactCurrency, formatDate, formatNumber } from '../utils/format.js';
import {
  CLOSED_STAGES, ENQUIRY_STAGES, SOURCES, buildEnquiryPayload, followUpState, stageLabel,
} from '../utils/pipeline.js';

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/** Counts and value per stage, in funnel order — the marketing dashboard's spine. */
function Funnel({ selected, onSelect }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    enquiriesApi.pipeline().then(setRows).catch(() => setRows([]));
  }, []);

  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row]));
  const stages = ENQUIRY_STAGES.filter((stage) => byStatus[stage.value] || stage.value === selected);
  if (!stages.length) return null;

  return (
    <div role="tablist" aria-label="Filter by stage" className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {stages.map((stage) => {
        const row = byStatus[stage.value] || { count: 0, value: 0 };
        const active = selected === stage.value;

        return (
          <button
            key={stage.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(active ? '' : stage.value)}
            className={`card-interactive px-3.5 py-3 text-left ${active ? '!border-flame-500/40' : ''}`}
          >
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
              {stage.label}
            </p>
            <p className="mt-1 text-lg font-extrabold tabular-nums leading-none tracking-tight text-steel-50">
              {row.count}
            </p>
            <p className="mt-1 text-xs tabular-nums text-steel-400">
              {formatCompactCurrency(row.value)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function EnquiryForm({ onClose, onSaved }) {
  const [error, setError] = useState(null);
  const [customer, setCustomer] = useState(undefined);
  const [product, setProduct] = useState(undefined);
  const [isNewDevelopment, setNewDevelopment] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { source: 'phone' } });

  const submit = async (values) => {
    setError(null);

    if (!customer) {
      setError({ message: 'Pick the customer this enquiry belongs to.' });
      return;
    }
    if (!product && !isNewDevelopment) {
      setError({ message: 'Pick a model from the catalogue, or mark this as a new development.' });
      return;
    }

    try {
      onSaved(
        await enquiriesApi.create({
          customer,
          ...buildEnquiryPayload(values, { product, isNewDevelopment }),
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
        <Field label="Customer" className="sm:col-span-2" hint="Not a customer yet? Start it as a lead instead.">
          <CustomerSelect value={customer} onChange={setCustomer} aria-label="Customer" />
        </Field>
        <Field label="How the enquiry reached us">
          <select className="input" {...register('source')}>
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <EnquiryFields
        register={register}
        errors={errors}
        product={product}
        onProductChange={setProduct}
        newDevelopment={isNewDevelopment}
        onNewDevelopmentChange={setNewDevelopment}
      />

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
          {isSubmitting ? 'Saving…' : 'Raise enquiry'}
        </button>
      </div>
    </form>
  );
}

export default function Enquiries() {
  const { canWrite, isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('open');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const term = useDebounced(search);

  // "Due" is the morning follow-up list: everything open whose date has arrived.
  const endOfToday = useCallback(() => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date.toISOString();
  }, []);

  // Arriving from a customer's history: that customer's enquiries, all stages. The whole
  // history is what was asked for, so the open-only default would hide most of the answer.
  const forCustomer = searchParams.get('customer') || undefined;

  // One object for both the list and the export, so the file is exactly what is on screen —
  // exporting "due now" and getting every enquiry would be worse than no export at all.
  const filters = {
    search: term || undefined,
    status: status || undefined,
    customer: forCustomer,
    open: !forCustomer && (view === 'open' || view === 'due') ? 'true' : undefined,
    dueBy: view === 'due' ? endOfToday() : undefined,
  };

  const { data, pagination, loading, error, reload } = useRecordList(enquiriesApi.list, {
    ...filters,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('enquiries');
  const selection = useSelection(data);

  const change = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const views = [
    { value: 'open', label: 'Open' },
    { value: 'due', label: 'Due now' },
    { value: 'all', label: 'All' },
  ];

  /**
   * Picking a closed stage off the funnel also drops the open-only view — otherwise the
   * two filters contradict each other and the tile reports records the table cannot show.
   */
  const selectStage = (value) => {
    change(setStatus)(value);
    if (CLOSED_STAGES.includes(value) && view !== 'all') setView('all');
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Enquiries"
        subtitle="One enquiry per model, each carrying a next action until it closes"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.enquiries} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                + New enquiry
              </button>
            )}
          </div>
        }
      />

      <Funnel selected={status} onSelect={selectStage} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search number, model or remarks…"
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

        <select
          className="input w-52"
          aria-label="Stage"
          value={status}
          onChange={(event) => change(setStatus)(event.target.value)}
        >
          <option value="">All stages</option>
          {ENQUIRY_STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>{stage.label}</option>
          ))}
        </select>
      </div>

      {/* An active filter the reader cannot see is a short list with no explanation. */}
      {forCustomer && (
        <div className="mb-3 flex items-center gap-2 text-xs text-steel-400">
          <span>
            Showing one customer&rsquo;s enquiries
            {data[0]?.customer?.name ? ` — ${data[0].customer.name}` : ''}
          </span>
          <button
            type="button"
            className="font-semibold text-steel-300 hover:text-accent"
            onClick={() => {
              setSearchParams({});
              setPage(1);
            }}
          >
            Clear
          </button>
        </div>
      )}

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title={view === 'due' ? 'Nothing due' : 'No enquiries here'}
          description={
            view === 'due'
              ? 'Every open enquiry has its follow-up date still ahead of it.'
              : 'Raise an enquiry against a customer, or convert a qualified lead.'
          }
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    {isAdmin && (
                      <th className="w-10 px-3 py-3">
                        <RowCheckbox
                          checked={selection.allSelected}
                          onChange={selection.toggleAll}
                          label="Select every enquiry on this page"
                        />
                      </th>
                    )}
                    <th className="px-3 py-3">Enquiry</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Model</th>
                    <th className="px-3 py-3 text-right">Quantity</th>
                    <th className="px-3 py-3 text-right">Value</th>
                    <th className="px-3 py-3">Next action</th>
                    <th className="px-3 py-3">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((enquiry) => {
                    const due = followUpState(enquiry.nextFollowUpDate);
                    return (
                      <tr key={enquiry._id} className="row-hover">
                        {isAdmin && (
                          <td className="px-3 py-3.5">
                            <RowCheckbox
                              checked={selection.selected.has(enquiry._id)}
                              onChange={() => selection.toggle(enquiry._id)}
                              label={`Select ${enquiry.number}`}
                            />
                          </td>
                        )}
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <Link to={`/enquiries/${enquiry._id}`} className="font-semibold text-steel-100 hover:text-accent">
                            {enquiry.number}
                          </Link>
                          <p className="text-xs text-steel-400">{formatDate(enquiry.enquiryDate)}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <Link to={`/customers/${enquiry.customer?._id}`} className="text-steel-200 hover:text-accent">
                            {enquiry.customer?.name || '—'}
                          </Link>
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="text-steel-200">
                            {enquiry.product?.modelCode || enquiry.requirement?.modelNumber || '—'}
                          </p>
                          {enquiry.isNewDevelopment && <Badge tone="accent">New development</Badge>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-200">
                          {formatNumber(enquiry.requirement?.quantity)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-100">
                          {enquiry.estimatedValue ? formatCompactCurrency(enquiry.estimatedValue) : '—'}
                        </td>
                        <td className="max-w-[15rem] px-3 py-3.5">
                          <p className="truncate text-steel-300">{enquiry.nextAction || '—'}</p>
                          {due && <p className={`text-xs ${TONE_TEXT[due.tone]}`}>{due.text}</p>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5">
                          <Badge status={enquiry.status}>{stageLabel(enquiry.status)}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
          {isAdmin && (
            <BulkBar collection="enquiries" selection={selection} noun="enquiries" onDone={reload} />
          )}
        </>
      ))}

      <Modal
        open={creating}
        title="New enquiry"
        description="One model per enquiry, so sample and price stay answerable per model"
        size="lg"
        onClose={() => setCreating(false)}
      >
        <EnquiryForm onClose={() => setCreating(false)} onSaved={reload} />
      </Modal>
    </div>
  );
}
