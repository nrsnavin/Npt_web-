import { useEffect, useState } from 'react';
import CustomerPanel from '../components/CustomerPanel.jsx';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { customers as customersApi, deliveryRoutesApi, downloads, transportersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, FormError, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import BulkBar, { RowCheckbox, useSelection } from '../components/BulkReassign.jsx';
import ExportButton from '../components/ExportButton.jsx';
import OwnerPicker from '../components/OwnerPicker.jsx';
import PlaceInput from '../components/PlaceInput.jsx';
import { SortHeader, useSort } from '../components/SortHeader.jsx';
import { formatCompactCurrency, formatDate } from '../utils/format.js';
import { CUSTOMER_TYPES, LANDMARK_ROUTES, SOURCES, optionLabel } from '../utils/pipeline.js';
import useOpenFromLink from '../hooks/useOpenFromLink.js';
import QcStandardsFields, { standardsPayload } from '../components/QcStandardsFields.jsx';

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
/** How this buyer's goods usually travel — what the trip planner groups them by [TripPlanner]. */
const DELIVERY_MODES = [
  { value: 'own_vehicle', label: 'Our vehicle' },
  { value: 'transport', label: 'Transport booking' },
  { value: 'party_collects', label: 'Party collects' },
  { value: 'courier', label: 'Courier' },
];
const idOf = (value) => (value && typeof value === 'object' ? value._id : value) || '';

/* A stored number shown without the +91 the box already prints; anything else shown as it is. */
const localPhone = (phone) => (phone ? String(phone).replace(/^\+91/, '') : '');

const roleContactDefaults = (contact) => ({
  sameAsOrder: Boolean(contact?.sameAsOrder),
  name: contact?.name || '',
  phone: localPhone(contact?.phone),
});

/* The same as the order contact, a person of its own, or — left empty — nothing said. */
function roleContactPayload(values, editing) {
  if (values?.sameAsOrder) return { sameAsOrder: true };
  const name = values?.name?.trim();
  const phone = values?.phone?.trim();
  if (name || phone) return { sameAsOrder: false, name: name || undefined, phone: phone || undefined };
  return editing ? { sameAsOrder: false } : undefined;
}

const primaryContactOf = (customer) => customer?.contacts?.find((contact) => contact.isPrimary) || customer?.contacts?.[0];

/** The order contact's name goes on the buyer's primary contact; the other contacts are kept. */
function contactsPayload(customer, values) {
  const name = values.orderContact?.trim();
  const kept = (customer?.contacts || []).map(({ _id, ...contact }) => contact);
  if (!name) return kept.length ? kept : undefined;
  const at = kept.findIndex((contact) => contact.isPrimary);
  const index = at >= 0 ? at : kept.length ? 0 : -1;
  if (index >= 0) {
    kept[index] = { ...kept[index], name, isPrimary: true };
    return kept;
  }
  return [{ name, mobile: values.mobile || undefined, whatsapp: values.whatsapp || undefined, email: values.email || undefined, isPrimary: true }];
}

/** Delivery, or accounts & payments: the order contact, or a person and a number of their own. */
function RoleContactFields({ register, watch, name, title, personLabel, phoneLabel }) {
  const same = watch(`${name}.sameAsOrder`);
  return (
    <fieldset className="rounded-lg border border-line/[0.08] p-4" aria-label={title}>
      <legend className="px-1 text-xs font-bold uppercase tracking-[0.08em] text-steel-400">
        {title} <span className="font-normal normal-case tracking-normal text-steel-500">— optional</span>
      </legend>
      <label className="flex items-center gap-2 text-sm text-steel-200">
        <input type="checkbox" className="h-4 w-4 accent-flame-500" {...register(`${name}.sameAsOrder`)} />
        {title} is the same as order contact
      </label>
      {!same && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label={personLabel}>
            <input className="input" {...register(`${name}.name`)} />
          </Field>
          <Field label={phoneLabel}>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-line/[0.12] bg-line/[0.04] px-2.5 text-sm text-steel-400">+91</span>
              <input type="tel" inputMode="tel" className="input rounded-l-none" {...register(`${name}.phone`)} />
            </div>
          </Field>
        </div>
      )}
    </fieldset>
  );
}

export function CustomerForm({ customer, onClose, onSaved, onCreate, submitLabel, ownerFixed = false }) {
  const [error, setError] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const editing = Boolean(customer?._id);
  /* The dispatch lists, when this person may read them; without the grant the two pickers stay hidden. */
  const [lists, setLists] = useState({ transporters: [], routes: [] });
  useEffect(() => {
    let live = true;
    Promise.all([
      transportersApi.list({ active: 'true' }).catch(() => []),
      deliveryRoutesApi.list({ active: 'true' }).catch(() => []),
    ]).then(([transporters, routes]) => live && setLists({ transporters, routes }));
    return () => { live = false; };
  }, []);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: editing
      ? {
          ...customer,
          usualTransporter: idOf(customer.usualTransporter),
          deliveryRoute: idOf(customer.deliveryRoute),
          deliveryMode: customer.deliveryMode || '',
          qcStandards: { ...(customer.qcStandards || {}) },
          orderContact: primaryContactOf(customer)?.name || '',
          deliveryContact: roleContactDefaults(customer.deliveryContact),
          accountsContact: roleContactDefaults(customer.accountsContact),
        }
      : {
          customerType: 'garment_factory',
          rating: 'B',
          source: 'manual',
          country: 'India',
          notifications: { whatsapp: true, email: true },
          ...customer,
          orderContact: primaryContactOf(customer)?.name || customer?.orderContact || '',
          deliveryContact: roleContactDefaults(customer?.deliveryContact),
          accountsContact: roleContactDefaults(customer?.accountsContact),
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
    const { orderContact: _orderContact, ...rest } = values;
    const payload = {
      ...rest,
      contacts: contactsPayload(customer, values),
      deliveryContact: roleContactPayload(values.deliveryContact, editing),
      accountsContact: roleContactPayload(values.accountsContact, editing),
      landmark: values.landmark || (editing ? '' : undefined),
      creditTermsDays: numeric(values.creditTermsDays),
      email: values.email || undefined,
      gstin: values.gstin || undefined,
      mobile: values.mobile || undefined,
      whatsapp: values.whatsapp || undefined,
      /* Cleared on an edit is cleared on the record; left blank on a new buyer is simply not set. */
      deliveryMode: values.deliveryMode || (editing ? null : undefined),
      usualTransporter: values.usualTransporter || (editing ? null : undefined),
      deliveryRoute: values.deliveryRoute || (editing ? null : undefined),
      qcStandards: standardsPayload(values.qcStandards, { clearing: editing }),
    };

    try {
      onSaved(
        editing
          // The version this form was opened on, so a colleague's save is not silently
          // overwritten by ours.
          ? await customersApi.update({ id: customer._id, expectedUpdatedAt: customer.updatedAt, ...payload })
          : await (onCreate || customersApi.create)(payload)
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" error={errors.name} className="sm:col-span-2" required>
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

        {/*
          The account owner. Only on create: moving a customer afterwards is a reassignment, and
          the server holds that to be a management decision — see `assertReassignment`.
        */}
        {/* Converting a prospect: the customer is the enquiry owner's, so nothing to choose. */}
        {!editing && !ownerFixed && (
          <OwnerPicker
            register={register}
            watch={watch}
            error={errors.assignedTo}
            load={customersApi.team}
            label="Who owns this account"
          />
        )}
        <Field label="Mobile">
          <input type="tel" className="input" onBlurCapture={checkForDuplicate} {...register('mobile')} />
        </Field>
        <Field label="WhatsApp" hint="Leave blank if the same as mobile">
          <input type="tel" className="input" onBlurCapture={checkForDuplicate} {...register('whatsapp')} />
        </Field>
        <Field label="Order contact person" hint="Who places the orders — delivery and accounts can be the same person">
          <input className="input" {...register('orderContact')} />
        </Field>
        <Field label="Email" error={errors.email}>
          <input type="email" className="input" {...register('email')} />
        </Field>
        <Field label="GST number" hint="The strongest way to spot a duplicate">
          <input className="input uppercase" onBlurCapture={checkForDuplicate} {...register('gstin')} />
        </Field>
        {/*
          The street address, which is what a lorry needs. §19 will not let a consignment leave
          without one, and it prefills from here — so a buyer with a town and no address is a
          buyer whose every consignment is raised one paperwork item short.
        */}
        <Field
          label="Delivery address"
          hint="Where the lorry goes. Copied onto each consignment, which can then be edited for a one-off destination"
          className="sm:col-span-2"
        >
          <textarea rows={2} className="input" {...register('address')} />
        </Field>
        {/* The locality and the landmark a driver asks for — the trip planner groups buyers at the
            same landmark (or area, or PIN) for one vehicle. */}
        <Field label="Area / locality">
          <input className="input" placeholder="Kumar Nagar" {...register('area')} />
        </Field>
        <Field label="Landmark / route" hint="This route will be sent to the Dispatch Team for vehicle planning.">
          <select className="input" {...register('landmark')}>
            <option value="">Select route</option>
            {LANDMARK_ROUTES.map((route) => <option key={route} value={route}>{route}</option>)}
            {/* A landmark typed before the list existed stays choosable rather than silently blanked. */}
            {customer?.landmark && !LANDMARK_ROUTES.includes(customer.landmark) && (
              <option value={customer.landmark}>{customer.landmark}</option>
            )}
          </select>
        </Field>
        {/* How the goods go — the trip planner groups transport bookings by transporter and our own
            deliveries by route, then landmark. */}
        <Field label="Goods usually go by" hint="Dispatch plans trips from this">
          <select className="input" {...register('deliveryMode')}>
            <option value="">Not set</option>
            {DELIVERY_MODES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        {lists.transporters.length > 0 && (
          <Field label="Usual transporter">
            <select className="input" {...register('usualTransporter')}>
              <option value="">Not set</option>
              {lists.transporters.map((row) => <option key={row._id} value={row._id}>{row.name}{row.bookingOffice ? ` · ${row.bookingOffice}` : ''}</option>)}
            </select>
          </Field>
        )}
        {lists.routes.length > 0 && (
          <Field label="Delivery route" hint="For our own vehicle">
            <select className="input" {...register('deliveryRoute')}>
              <option value="">Not set</option>
              {lists.routes.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}
            </select>
          </Field>
        )}
        {/* The same suggestion list the other forms use. Suggesting on one and not the other
            would leave half the records free text, and the by-city report reads both. */}
        <Field label="City">
          <PlaceInput
            kind="city"
            aria-label="City"
            placeholder="Tiruppur, Ludhiana, Surat…"
            value={watch('city')}
            state={watch('state')}
            onChange={(next) => setValue('city', next, { shouldDirty: true })}
            onResolveState={(next) => setValue('state', next, { shouldDirty: true })}
          />
        </Field>
        <Field label="State">
          <PlaceInput
            kind="state"
            aria-label="State"
            placeholder="Tamil Nadu…"
            value={watch('state')}
            onChange={(next) => setValue('state', next, { shouldDirty: true })}
          />
        </Field>
        <Field label="Pincode">
          <input className="input" inputMode="numeric" {...register('pincode')} />
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

      <RoleContactFields
        register={register}
        watch={watch}
        name="deliveryContact"
        title="Delivery contact"
        personLabel="Delivery contact person"
        phoneLabel="Delivery contact phone"
      />
      <RoleContactFields
        register={register}
        watch={watch}
        name="accountsContact"
        title="Accounts & Payments contact"
        personLabel="Accounts & Payments contact person"
        phoneLabel="Accounts & Payments phone / WhatsApp"
      />

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

      {/* Only where this buyer asks for more than the model's standards. */}
      <QcStandardsFields register={register} who="buyer" open={Boolean(customer?.qcStandards && Object.keys(customer.qcStandards).length)} />

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

      <FormError error={error} />

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : submitLabel || 'Create customer'}
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
  /* The buyer's side panel [components/CustomerPanel.jsx], as on the dashboard's party master. */
  const [panel, setPanel] = useState(null);
  /* The command bar's "New …" arrives as `?new=1` with the form to open. */
  useOpenFromLink(() => setCreating(true));
  const { sort, toggle } = useSort();

  const sortBy = (field) => {
    toggle(field);
    setPage(1);
  };

  const term = useDebounced(search);
  // One object for both the list and the export, so the file is exactly what is on screen.
  const filters = {
    search: term || undefined,
    customerType: type || undefined,
    status: status || undefined,
  };
  const { data, pagination, loading, error, reload } = useRecordList(customersApi.list, {
    ...filters,
    sort: sort || undefined,
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
        <input aria-label="Search name, code, GST or phone"
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
          description="Customers arrive from IndiaMART and from WhatsApp chat screenshots saved as draft enquiries, or you can add one directly."
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
                    <SortHeader field="name" label="Customer" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="customerType" label="Type" sort={sort} onToggle={sortBy} className="px-4" />
                    <SortHeader field="city" label="Location" sort={sort} onToggle={sortBy} className="px-4" />
                    <th className="px-4 py-3">Owner</th>
                    {/*
                      Not sortable, and the reason is worth knowing: the customer record carries
                      stored fields by these names, but nothing writes them — the server
                      recomputes both figures from the orders and receivables on every read. An
                      ordering would rank the page by a dead number and draw a live one beside
                      it, so the server refuses the key rather than answer a question wrong.
                    */}
                    <th className="px-4 py-3 text-right">Business</th>
                    <th className="px-4 py-3 text-right">Last order</th>
                    <SortHeader field="status" label="Status" sort={sort} onToggle={sortBy} className="px-4" />
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((customer) => (
                    <tr
                      key={customer._id}
                      className={`row-hover cursor-pointer ${panel === customer._id ? 'bg-accent/[0.06]' : ''}`}
                      /* The row opens the buyer's side panel; the name still goes to their page. */
                      onClick={(event) => { if (!event.target.closest('a, button, input, label')) setPanel(customer._id); }}
                    >
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
                      <td className="px-4 py-3.5 text-right">
                        <button type="button" className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs" onClick={() => setPanel(customer._id)} aria-label={`Actions for ${customer.name}`}>
                          Actions ›
                        </button>
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

      {panel && <CustomerPanel customerId={panel} onClose={() => setPanel(null)} onChanged={reload} />}

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
