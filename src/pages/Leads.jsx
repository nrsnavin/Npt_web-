import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { leads } from '../api/endpoints.js';
import { useListParams, useResource } from '../hooks/useResource.js';
import DataTable from '../components/DataTable.jsx';
import Toolbar from '../components/Toolbar.jsx';
import { Badge, Field, Modal, PageHeader } from '../components/ui.jsx';
import { formatCompactCurrency, formatDate, humanise } from '../utils/format.js';
import { useAuth } from '../context/AuthContext.jsx';

const STAGES = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost'];
const SOURCES = ['website', 'referral', 'trade_show', 'cold_call', 'existing_customer', 'marketplace', 'other'];

function LeadForm({ lead, onSubmit, onClose, saving, error }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: lead
      ? {
          ...lead,
          expectedCloseDate: lead.expectedCloseDate?.slice(0, 10),
        }
      : { stage: 'new', source: 'website', estimatedValue: 0, estimatedMonthlyVolume: 0 },
  });

  const submit = (values) =>
    onSubmit({
      ...values,
      estimatedValue: Number(values.estimatedValue) || 0,
      estimatedMonthlyVolume: Number(values.estimatedMonthlyVolume) || 0,
      expectedCloseDate: values.expectedCloseDate || undefined,
    });

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" error={errors.company} className="sm:col-span-2">
          <input className="input" {...register('company', { required: 'Company is required' })} />
        </Field>
        <Field label="Contact person">
          <input className="input" {...register('contactName')} />
        </Field>
        <Field label="City">
          <input className="input" {...register('city')} />
        </Field>
        <Field label="Email">
          <input type="email" className="input" {...register('email')} />
        </Field>
        <Field label="Phone">
          <input className="input" {...register('phone')} />
        </Field>
        <Field label="Stage">
          <select className="input" {...register('stage')}>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {humanise(stage)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source">
          <select className="input" {...register('source')}>
            {SOURCES.map((source) => (
              <option key={source} value={source}>
                {humanise(source)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estimated value (₹)">
          <input type="number" min="0" step="any" className="input" {...register('estimatedValue')} />
        </Field>
        <Field label="Monthly volume (pcs)">
          <input type="number" min="0" className="input" {...register('estimatedMonthlyVolume')} />
        </Field>
        <Field label="Expected close date">
          <input type="date" className="input" {...register('expectedCloseDate')} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea rows={3} className="input" {...register('notes')} />
        </Field>
      </div>

      {error && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">{error.message}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : lead ? 'Save changes' : 'Create lead'}
        </button>
      </div>
    </form>
  );
}

export default function Leads() {
  const { can } = useAuth();
  const { params, setPage, setFilter } = useListParams({ sort: '-createdAt' });
  const { rows, pagination, isLoading, error, refetch, create, update, invalidate } = useResource(
    'leads',
    leads,
    params
  );

  const [editing, setEditing] = useState(null);
  const [converting, setConverting] = useState(null);
  const [activityFor, setActivityFor] = useState(null);
  const canEdit = can('sales');

  const columns = [
    {
      key: 'company',
      header: 'Company',
      render: (row) => (
        <div>
          <p className="font-medium text-steel-50">{row.company}</p>
          <p className="text-xs text-steel-500">{row.contactName || '—'}</p>
        </div>
      ),
    },
    { key: 'city', header: 'City', render: (row) => row.city || '—' },
    { key: 'source', header: 'Source', render: (row) => humanise(row.source) },
    { key: 'stage', header: 'Stage', render: (row) => <Badge status={row.stage} /> },
    {
      key: 'estimatedValue',
      header: 'Value',
      className: 'text-right',
      render: (row) => formatCompactCurrency(row.estimatedValue),
    },
    {
      key: 'expectedCloseDate',
      header: 'Expected close',
      render: (row) => formatDate(row.expectedCloseDate),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right whitespace-nowrap',
      render: (row) =>
        canEdit ? (
          <div className="flex justify-end gap-2">
            <button type="button" className="row-action" onClick={() => setActivityFor(row)}>
              Log
            </button>
            <button type="button" className="row-action" onClick={() => setEditing(row)}>
              Edit
            </button>
            {!row.convertedCustomer && (
              <button
                type="button"
                className="row-action"
                onClick={() => setConverting(row)}
              >
                Convert
              </button>
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Enquiries from buyers, exporters and retail chains"
        actions={
          canEdit && (
            <button type="button" className="btn-primary" onClick={() => setEditing({})}>
              + New lead
            </button>
          )
        }
      />

      <Toolbar
        search={params.search || ''}
        onSearchChange={(value) => setFilter('search', value)}
        placeholder="Search company, contact, email…"
        filters={[
          {
            key: 'stage',
            label: 'All stages',
            value: params.stage || '',
            onChange: (value) => setFilter('stage', value),
            options: STAGES.map((stage) => ({ value: stage, label: humanise(stage) })),
          },
          {
            key: 'source',
            label: 'All sources',
            value: params.source || '',
            onChange: (value) => setFilter('source', value),
            options: SOURCES.map((source) => ({ value: source, label: humanise(source) })),
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        pagination={pagination}
        onPageChange={setPage}
        emptyTitle="No leads yet"
        emptyDescription="Capture an enquiry to start tracking the pipeline."
      />

      <Modal
        open={Boolean(editing)}
        title={editing?._id ? 'Edit lead' : 'New lead'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <LeadForm
            lead={editing._id ? editing : null}
            saving={create.isPending || update.isPending}
            error={create.error || update.error}
            onClose={() => setEditing(null)}
            onSubmit={async (values) => {
              if (editing._id) await update.mutateAsync({ id: editing._id, ...values });
              else await create.mutateAsync(values);
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <ActivityModal lead={activityFor} onClose={() => setActivityFor(null)} onSaved={invalidate} />
      <ConvertModal lead={converting} onClose={() => setConverting(null)} onSaved={invalidate} />
    </div>
  );
}

function ActivityModal({ lead, onClose, onSaved }) {
  const { register, handleSubmit, reset } = useForm({ defaultValues: { type: 'call' } });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (values) => {
    setSaving(true);
    setError(null);
    try {
      await leads.addActivity({ id: lead._id, ...values });
      onSaved();
      reset();
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(lead)} title={`Log activity — ${lead?.company || ''}`} onClose={onClose} size="sm">
      {lead && (
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Field label="Type">
            <select className="input" {...register('type')}>
              {['call', 'email', 'meeting', 'sample', 'note'].map((type) => (
                <option key={type} value={type}>
                  {humanise(type)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Summary">
            <textarea rows={3} className="input" {...register('summary', { required: true })} />
          </Field>

          {lead.activities?.length > 0 && (
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg bg-white/[0.04] p-3">
              {lead.activities
                .slice()
                .reverse()
                .map((activity) => (
                  <div key={activity._id} className="text-xs">
                    <span className="font-medium text-steel-200">{humanise(activity.type)}</span>
                    <span className="text-steel-500"> · {formatDate(activity.occurredAt)}</span>
                    <p className="text-steel-300">{activity.summary}</p>
                  </div>
                ))}
            </div>
          )}

          {error && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Add activity'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ConvertModal({ lead, onClose, onSaved }) {
  const { register, handleSubmit, reset } = useForm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (values) => {
    setSaving(true);
    setError(null);
    try {
      await leads.convert({
        id: lead._id,
        ...values,
        creditLimit: Number(values.creditLimit) || 0,
        paymentTermsDays: Number(values.paymentTermsDays) || 30,
      });
      onSaved();
      reset();
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(lead)} title="Convert lead to customer" onClose={onClose} size="sm">
      {lead && (
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <p className="text-sm text-steel-400">
            Creates a customer record from <span className="font-medium text-steel-200">{lead.company}</span> and marks
            the lead won.
          </p>
          <Field label="Customer code" hint="Leave blank to derive it from the company name">
            <input className="input uppercase" {...register('code')} />
          </Field>
          <Field label="GSTIN">
            <input className="input uppercase" {...register('gstin')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Credit limit (₹)">
              <input type="number" min="0" className="input" defaultValue={0} {...register('creditLimit')} />
            </Field>
            <Field label="Payment terms (days)">
              <input type="number" min="0" className="input" defaultValue={30} {...register('paymentTermsDays')} />
            </Field>
          </div>

          {error && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Converting…' : 'Convert'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
