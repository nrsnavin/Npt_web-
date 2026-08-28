import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { downloads, leads as leadsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecord, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import BulkBar, { RowCheckbox, useSelection } from '../components/BulkReassign.jsx';
import ExportButton from '../components/ExportButton.jsx';
import PlaceInput from '../components/PlaceInput.jsx';
import StagePipeline from '../components/StagePipeline.jsx';
import { formatCompactCurrency, formatNumber } from '../utils/format.js';
import { SOURCES, followUpState, leadStageLabel } from '../utils/pipeline.js';

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

  /*
   * The place filter lives in the address rather than in state, because it mostly arrives from
   * somewhere else: clicking a town on the analytics map opens this list already narrowed. A
   * filter in the URL is also a link somebody can send to a colleague, which a piece of
   * component state never is.
   */
  const [params, setParams] = useSearchParams();
  const place = params.get('city')
    ? { field: 'city', value: params.get('city') }
    : params.get('state')
      ? { field: 'state', value: params.get('state') }
      : null;

  /*
   * Whose leads. In the address like the place filter, so a manager can send somebody the view
   * they are talking about rather than describing which dropdown to set.
   */
  const owner = params.get('assignedTo') || '';

  /*
   * The people holding leads, scoped exactly as the list is — so a marketing person is offered
   * only themselves, and the picker below simply is not drawn. No role check on the screen: the
   * answer already carries the rule.
   */
  const fetchOwners = useCallback(() => leadsApi.owners(), []);
  const { data: owners } = useRecord(fetchOwners, 'lead-owners');
  const team = owners || [];

  const term = useDebounced(search);
  // One object for both the list and the export, so the file is exactly what is on screen.
  const filters = {
    search: term || undefined,
    status: status || undefined,
    assignedTo: owner || undefined,
    [place?.field || 'city']: place?.value,
  };
  const { data, pagination, meta, loading, error, reload } = useRecordList(leadsApi.list, {
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

  // Back to page one, or the narrowed result is read from page four of a list that is now two
  // pages long.
  const clearPlace = () => {
    const next = new URLSearchParams(params);
    next.delete('city');
    next.delete('state');
    setParams(next, { replace: true });
    setPage(1);
  };

  const selectOwner = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set('assignedTo', value);
    else next.delete('assignedTo');
    setParams(next, { replace: true });
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Leads"
        subtitle="Parties we are not working yet. Qualify one and convert it into a customer."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/leads/analytics" className="btn-secondary">
              Analytics
            </Link>
            <ExportButton download={downloads.leads} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                + New lead
              </button>
            )}
          </div>
        }
      />

      {/*
        * The stage filter, which is also the shape of the book in miniature. The counts come
        * back with the rows rather than from their own request, so they narrow when the town
        * or the colleague does and can never disagree with the list beneath them.
        */}
      <StagePipeline
        counts={meta.stageCounts}
        selected={status}
        onSelect={selectStage}
        loading={loading}
      />

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
        {/*
          * Drawn only when there is a choice to make. A marketing person is offered one name —
          * their own — and a dropdown with a single option is a control that can only waste a
          * click, so it is simply not there.
          */}
        {team.length > 1 && (
          <select
            className="input max-w-[14rem]"
            aria-label="Filter by marketing person"
            value={owner}
            onChange={(event) => selectOwner(event.target.value)}
          >
            <option value="">Everyone&apos;s leads</option>
            {team.map((person) => (
              <option key={person._id} value={person._id}>
                {person.name} ({person.leads})
              </option>
            ))}
          </select>
        )}
        {status && (
          <button type="button" className="btn-secondary" onClick={() => selectStage(status)}>
            Clear stage filter
          </button>
        )}
        {/*
          * A filter set from a map has to be visible in the list's own controls too. Somebody
          * who scrolled past the map and finds nine rows where there were forty must be able
          * to see why without scrolling back up to look for a highlighted dot.
          */}
        {place && (
          <button type="button" className="btn-secondary" onClick={clearPlace}>
            Clear {place.value} ✕
          </button>
        )}
      </div>

      {loading && <TableSkeleton columns={7} />}
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
                    <th className="px-4 py-3">Owner</th>
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
                        {/*
                          * Whose lead it is. Unassigned is called out rather than left blank —
                          * a lead nobody owns is the thing §3 exists to prevent, and an empty
                          * cell reads as "not filled in yet" instead of as a problem.
                          */}
                        <td className="whitespace-nowrap px-4 py-3.5">
                          {lead.assignedTo?.name ? (
                            <button
                              type="button"
                              onClick={() => selectOwner(lead.assignedTo._id)}
                              className="text-left text-steel-300 hover:text-accent"
                              title={`Show only ${lead.assignedTo.name}'s leads`}
                            >
                              {lead.assignedTo.name}
                            </button>
                          ) : (
                            <span className="text-warn-400">Unassigned</span>
                          )}
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
