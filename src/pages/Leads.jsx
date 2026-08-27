import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { downloads, leads as leadsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import BulkBar, { RowCheckbox, useSelection } from '../components/BulkReassign.jsx';
import ExportButton from '../components/ExportButton.jsx';
import PlaceInput from '../components/PlaceInput.jsx';
import { formatCompactCurrency, formatNumber } from '../utils/format.js';
import { LEAD_STAGES, SOURCES, followUpState, leadStageLabel } from '../utils/pipeline.js';

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

function LeadForm({ onClose, onSaved }) {
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { source: 'phone' } });

  // Registered rather than spread onto an input, because the value comes from the suggestion
  // list as well as the keyboard and react-hook-form has to see both.
  const city = watch('city');
  const state = watch('state');

  const submit = async (values) => {
    setError(null);
    const numeric = (value) => (value === '' || value == null ? undefined : Number(value));

    try {
      onSaved(
        await leadsApi.create({
          ...values,
          email: values.email || undefined,
          estimatedQuantity: numeric(values.estimatedQuantity),
          estimatedValue: numeric(values.estimatedValue),
          nextFollowUpDate: values.nextFollowUpDate || undefined,
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
        <Field label="Company" error={errors.company} className="sm:col-span-2">
          <input className="input" {...register('company', { required: 'Company is required' })} />
        </Field>
        <Field label="Contact name">
          <input className="input" {...register('contactName')} />
        </Field>
        <Field label="Designation">
          <input className="input" {...register('designation')} />
        </Field>
        <Field label="Mobile">
          <input type="tel" className="input" {...register('mobile')} />
        </Field>
        <Field label="Email" error={errors.email}>
          <input type="email" className="input" {...register('email')} />
        </Field>
        {/* City before state, and choosing a town fills the state in — which is the order
            somebody says an address in, and saves the second field most of the time. */}
        <Field label="City" hint="Pick from the list where you can — one spelling per town keeps the reports honest">
          <PlaceInput
            kind="city"
            aria-label="City"
            placeholder="Tiruppur, Ludhiana, Surat…"
            value={city}
            state={state}
            onChange={(next) => setValue('city', next, { shouldDirty: true })}
            onResolveState={(next) => setValue('state', next, { shouldDirty: true })}
          />
        </Field>
        <Field label="State">
          <PlaceInput
            kind="state"
            aria-label="State"
            placeholder="Tamil Nadu…"
            value={state}
            onChange={(next) => setValue('state', next, { shouldDirty: true })}
          />
        </Field>
        <Field label="How did they reach us">
          <select className="input" {...register('source')}>
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Estimated quantity">
          <input type="number" className="input" {...register('estimatedQuantity')} />
        </Field>
        <Field label="Estimated value (₹)">
          <input type="number" className="input" {...register('estimatedValue')} />
        </Field>
      </div>

      <Field label="What are they after" hint="Free text — a lead rarely names a model yet">
        <textarea rows={2} className="input" {...register('productInterest')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Next action">
          <input className="input" placeholder="Call to confirm sizes" {...register('nextAction')} />
        </Field>
        <Field label="Follow up on">
          <input type="date" className="input" {...register('nextFollowUpDate')} />
        </Field>
      </div>

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
          {isSubmitting ? 'Saving…' : 'Create lead'}
        </button>
      </div>
    </form>
  );
}

export default function Leads() {
  const { canWrite, isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const term = useDebounced(search);
  // One object for both the list and the export, so the file is exactly what is on screen.
  const filters = { search: term || undefined, status: status || undefined };
  const { data, pagination, loading, error, reload } = useRecordList(leadsApi.list, {
    ...filters,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('enquiries');
  const selection = useSelection(data);

  const selectStage = (value) => {
    setStatus(value === status ? '' : value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Leads"
        subtitle="Parties we are not working yet. Qualify one and convert it into a customer."
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.leads} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                + New lead
              </button>
            )}
          </div>
        }
      />

      {/* The funnel doubles as the stage filter — clicking a stage narrows the list to it. */}
      <div
        role="tablist"
        aria-label="Filter by stage"
        className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {LEAD_STAGES.map((stage) => (
          <button
            key={stage.value}
            type="button"
            role="tab"
            aria-selected={status === stage.value}
            onClick={() => selectStage(stage.value)}
            className={`card-interactive px-3.5 py-3 text-left ${
              status === stage.value ? '!border-flame-500/40' : ''
            }`}
          >
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
              {stage.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-steel-100">
              {status === stage.value ? 'Filtering' : 'Show'}
            </p>
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search company, contact or number…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {status && (
          <button type="button" className="btn-secondary" onClick={() => selectStage(status)}>
            Clear stage filter
          </button>
        )}
      </div>

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No leads here"
          description="Every enquiry that is not from an existing customer starts as a lead."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    {isAdmin && (
                      <th className="w-10 px-4 py-3">
                        <RowCheckbox
                          checked={selection.allSelected}
                          onChange={selection.toggleAll}
                          label="Select every lead on this page"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Interest</th>
                    <th className="px-4 py-3 text-right">Estimate</th>
                    <th className="px-4 py-3">Next action</th>
                    <th className="px-4 py-3">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((lead) => {
                    const due = followUpState(lead.nextFollowUpDate);
                    return (
                      <tr key={lead._id} className="row-hover">
                        {isAdmin && (
                          <td className="px-4 py-3.5">
                            <RowCheckbox
                              checked={selection.selected.has(lead._id)}
                              onChange={() => selection.toggle(lead._id)}
                              label={`Select ${lead.company}`}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3.5">
                          <Link to={`/leads/${lead._id}`} className="font-semibold text-steel-100 hover:text-accent">
                            {lead.company}
                          </Link>
                          <p className="text-xs text-steel-400">
                            {lead.number}
                            {lead.city && ` · ${lead.city}`}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-steel-200">{lead.contactName || '—'}</p>
                          {lead.mobile && <p className="text-xs text-steel-400">{lead.mobile}</p>}
                        </td>
                        <td className="max-w-xs px-4 py-3.5 text-steel-300">
                          <p className="truncate">{lead.productInterest || '—'}</p>
                          {lead.estimatedQuantity ? (
                            <p className="text-xs text-steel-500">{formatNumber(lead.estimatedQuantity)} pcs</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-100">
                          {lead.estimatedValue ? formatCompactCurrency(lead.estimatedValue) : '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-steel-300">{lead.nextAction || '—'}</p>
                          {due && <p className={`text-xs ${TONE_TEXT[due.tone]}`}>{due.text}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge status={lead.status}>{leadStageLabel(lead.status)}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
          {isAdmin && <BulkBar collection="leads" selection={selection} noun="leads" onDone={reload} />}
        </>
      ))}

      <Modal
        open={creating}
        title="New lead"
        description="Capture whoever got in touch — the detail can follow"
        size="lg"
        onClose={() => setCreating(false)}
      >
        <LeadForm onClose={() => setCreating(false)} onSaved={reload} />
      </Modal>
    </div>
  );
}
