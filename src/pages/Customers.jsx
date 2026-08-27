import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { customers as customersApi, downloads } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import BulkBar, { RowCheckbox, useSelection } from '../components/BulkReassign.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { formatCompactCurrency, formatDate } from '../utils/format.js';
import { CUSTOMER_TYPES, SOURCES, optionLabel } from '../utils/pipeline.js';

const RATINGS = [
  { value: 'A', label: 'A — key account' },
  { value: 'B', label: 'B — regular' },
  { value: 'C', label: 'C — occasional' },
];

/**
 * The customer form, shared by create and edit.
 *
 * On create it checks for a duplicate before submitting, on the same GST-then-number rule
 * the server enforces — the warning is worth more before the work than after the rejection.
 */
export function CustomerForm({ customer, onClose, onSaved }) {
  const [error, setError] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const editing = Boolean(customer?._id);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: editing
      ? customer
      : {
          customerType: 'garment_factory',
          rating: 'B',
          source: 'manual',
          country: 'India',
          notifications: { whatsapp: true, email: true },
          ...customer,
        },
  });

  const checkForDuplicate = async () => {
    const { gstin, mobile, whatsapp } = getValues();
    if (!gstin && !mobile && !whatsapp) return;
    try {
      const result = await customersApi.checkDuplicate({ gstin, mobile, whatsapp });
      setDuplicate(result.duplicate ? result : null);
    } catch {
      // A failed pre-check must never block the form; the server checks again on submit.
      setDuplicate(null);
    }
  };

  const submit = async (values) => {
    setError(null);
    const numeric = (value) => (value === '' || value == null ? undefined : Number(value));
    const payload = {
      ...values,
      creditTermsDays: numeric(values.creditTermsDays),
      email: values.email || undefined,
      gstin: values.gstin || undefined,
      mobile: values.mobile || undefined,
      whatsapp: values.whatsapp || undefined,
    };

    try {
      onSaved(
        editing
          // The version this form was opened on, so a colleague's save is not silently
          // overwritten by ours.
          ? await customersApi.update({ id: customer._id, expectedUpdatedAt: customer.updatedAt, ...payload })
          : await customersApi.create(payload)
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" error={errors.name} className="sm:col-span-2">
          <input className="input" {...register('name', { required: 'Company name is required' })} />
        </Field>
        <Field label="Customer type">
          <select className="input" {...register('customerType')}>
            {CUSTOMER_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Rating">
          <select className="input" {...register('rating')}>
            {RATINGS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Mobile">
          <input type="tel" className="input" onBlurCapture={checkForDuplicate} {...register('mobile')} />
        </Field>
        <Field label="WhatsApp" hint="Leave blank if the same as mobile">
          <input type="tel" className="input" onBlurCapture={checkForDuplicate} {...register('whatsapp')} />
        </Field>
        <Field label="Email" error={errors.email}>
          <input type="email" className="input" {...register('email')} />
        </Field>
        <Field label="GST number" hint="The strongest way to spot a duplicate">
          <input className="input uppercase" onBlurCapture={checkForDuplicate} {...register('gstin')} />
        </Field>
        <Field label="City">
          <input className="input" {...register('city')} />
        </Field>
        <Field label="State">
          <input className="input" {...register('state')} />
        </Field>
        <Field label="Country">
          <input className="input" {...register('country')} />
        </Field>
        <Field label="Credit terms (days)">
          <input type="number" className="input" {...register('creditTermsDays')} />
        </Field>
        <Field label="Payment terms">
          <input className="input" placeholder="45 days from invoice" {...register('paymentTerms')} />
        </Field>
        <Field label="How did they reach us">
          <select className="input" {...register('source')}>
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-lg border border-line/[0.06] p-4">
        <p className="eyebrow mb-1">Automatic updates</p>
        <p className="mb-3 text-xs leading-relaxed text-steel-500">
          Sample ready and sample dispatched are sent to this customer without anyone pressing
          send. Untick a channel they have asked not to be contacted on.
        </p>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-steel-200">
            <input type="checkbox" className="h-4 w-4 accent-flame-500" {...register('notifications.whatsapp')} />
            WhatsApp
          </label>
          <label className="flex items-center gap-2 text-sm text-steel-200">
            <input type="checkbox" className="h-4 w-4 accent-flame-500" {...register('notifications.email')} />
            Email
          </label>
        </div>
      </div>

      <Field label="Notes">
        <textarea rows={2} className="input" {...register('notes')} />
      </Field>

      {/* A duplicate owned by a colleague is reported without being handed over, so the
          warning names who to talk to rather than the record. */}
      {duplicate && (
        <Notice tone="warn">
          {duplicate.customer ? (
            <>
              {duplicate.customer.name} ({duplicate.customer.code}) already exists with the same{' '}
              {duplicate.matchedOn}. Raise the enquiry against that record rather than creating
              a second one.
            </>
          ) : (
            <>
              A customer with the same {duplicate.matchedOn} already exists
              {duplicate.owner ? `, and belongs to ${duplicate.owner}` : ''}. Speak to them
              rather than creating a second record.
            </>
          )}
        </Notice>
      )}

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
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create customer'}
        </button>
      </div>
    </form>
  );
}

export default function Customers() {
  const { canWrite, isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const term = useDebounced(search);
  // One object for both the list and the export, so the file is exactly what is on screen.
  const filters = {
    search: term || undefined,
    customerType: type || undefined,
    status: status || undefined,
  };
  const { data, pagination, loading, error, reload } = useRecordList(customersApi.list, {
    ...filters,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('customers');
  const selection = useSelection(data);

  const onFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Customers"
        subtitle="One master record per customer, with its full enquiry history"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.customers} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                + New customer
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search name, code, GST or phone…"
          value={search}
          onChange={onFilterChange(setSearch)}
        />
        <select className="input w-48" value={type} onChange={onFilterChange(setType)} aria-label="Customer type">
          <option value="">All types</option>
          {CUSTOMER_TYPES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="input w-36" value={status} onChange={onFilterChange(setStatus)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading && <TableSkeleton columns={6} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Customers usually arrive by converting a qualified lead, but you can also add one directly."
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
                          label="Select every customer on this page"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3 text-right">Business</th>
                    <th className="px-4 py-3 text-right">Last order</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((customer) => (
                    <tr key={customer._id} className="row-hover">
                      {isAdmin && (
                        <td className="px-4 py-3.5">
                          <RowCheckbox
                            checked={selection.selected.has(customer._id)}
                            onChange={() => selection.toggle(customer._id)}
                            label={`Select ${customer.name}`}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3.5">
                        <Link to={`/customers/${customer._id}`} className="font-semibold text-steel-100 hover:text-accent">
                          {customer.name}
                        </Link>
                        <p className="text-xs text-steel-400">
                          {customer.code}
                          {customer.rating && ` · Rating ${customer.rating}`}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-steel-200">
                        {optionLabel(CUSTOMER_TYPES, customer.customerType)}
                      </td>
                      <td className="px-4 py-3.5 text-steel-300">
                        {[customer.city, customer.state].filter(Boolean).join(', ') || customer.country || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-steel-300">{customer.assignedTo?.name || '—'}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-steel-100">
                        {formatCompactCurrency(customer.totalBusinessValue)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-steel-400">
                        {customer.lastOrderDate ? formatDate(customer.lastOrderDate) : 'Never'}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge status={customer.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
          {isAdmin && (
            <BulkBar collection="customers" selection={selection} noun="customers" onDone={reload} />
          )}
        </>
      ))}

      <Modal
        open={creating}
        title="New customer"
        description="Check for an existing record before creating a second one"
        size="lg"
        onClose={() => setCreating(false)}
      >
        <CustomerForm onClose={() => setCreating(false)} onSaved={reload} />
      </Modal>
    </div>
  );
}
