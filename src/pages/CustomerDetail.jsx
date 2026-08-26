import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { customers as customersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Facts, Modal, PageHeader, Section, Spinner } from '../components/ui.jsx';
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber } from '../utils/format.js';
import { CUSTOMER_TYPES, SOURCES, optionLabel, stageLabel } from '../utils/pipeline.js';
import { CustomerForm } from './Customers.jsx';

function ContactCard({ contact }) {
  return (
    <li className="rounded-lg border border-line/[0.06] px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-steel-100">{contact.name}</p>
          {contact.designation && <p className="text-xs text-steel-400">{contact.designation}</p>}
        </div>
        {contact.isPrimary && <Badge tone="accent">Primary</Badge>}
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-steel-400">
        {contact.mobile && <p>{contact.mobile}</p>}
        {contact.email && <p>{contact.email}</p>}
      </div>
    </li>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const [editing, setEditing] = useState(false);

  const fetch = useCallback((customerId) => customersApi.get(customerId), []);
  const { data, loading, error, reload } = useRecord(fetch, id);

  if (loading) return <Spinner label="Loading customer" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { customer, timeline } = data;
  const mayWrite = canWrite('customers');

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={customer.name}
        subtitle={`${customer.code} · ${optionLabel(CUSTOMER_TYPES, customer.customerType)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge status={customer.status} />
            {mayWrite && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Details">
            <Facts
              items={[
                { label: 'Owner', value: customer.assignedTo?.name },
                { label: 'Rating', value: customer.rating && `${customer.rating} grade` },
                { label: 'Location', value: [customer.city, customer.state, customer.country].filter(Boolean).join(', ') },
                { label: 'Source', value: optionLabel(SOURCES, customer.source) },
                { label: 'Mobile', value: customer.mobile },
                { label: 'WhatsApp', value: customer.whatsapp },
                { label: 'Email', value: customer.email },
                { label: 'GST number', value: customer.gstin },
                { label: 'Credit terms', value: customer.creditTermsDays ? `${customer.creditTermsDays} days` : 'Advance' },
                { label: 'Payment terms', value: customer.paymentTerms },
                { label: 'Notes', value: customer.notes, wide: true },
              ]}
            />
          </Section>

          <Section title={`Enquiry history (${timeline.enquiries.length})`}>
            {timeline.enquiries.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-3 py-2.5">Enquiry</th>
                      <th className="px-3 py-2.5">Model</th>
                      <th className="px-3 py-2.5 text-right">Quantity</th>
                      <th className="px-3 py-2.5 text-right">Value</th>
                      <th className="px-3 py-2.5">Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/[0.04]">
                    {timeline.enquiries.map((enquiry) => (
                      <tr key={enquiry._id} className="row-hover">
                        <td className="px-3 py-3">
                          <Link to={`/enquiries/${enquiry._id}`} className="font-semibold text-steel-100 hover:text-accent">
                            {enquiry.number}
                          </Link>
                          <p className="text-xs text-steel-400">{formatDate(enquiry.enquiryDate)}</p>
                        </td>
                        <td className="px-3 py-3 text-steel-200">{enquiry.requirement?.modelNumber || '—'}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-steel-200">
                          {formatNumber(enquiry.requirement?.quantity)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-steel-200">
                          {enquiry.estimatedValue ? formatCurrency(enquiry.estimatedValue) : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <Badge status={enquiry.status}>{stageLabel(enquiry.status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-steel-500">
                No enquiries yet. Raise one from the enquiries screen.
              </p>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="Business">
            <dl className="space-y-4">
              <div>
                <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
                  Total business
                </dt>
                <dd className="stat-value mt-1">{formatCompactCurrency(customer.totalBusinessValue)}</dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
                  Outstanding
                </dt>
                <dd className={`stat-value mt-1 ${customer.outstandingAmount > 0 ? '!text-warn-400' : ''}`}>
                  {formatCompactCurrency(customer.outstandingAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
                  Last order
                </dt>
                <dd className="mt-1 text-sm text-steel-200">
                  {customer.lastOrderDate ? formatDate(customer.lastOrderDate) : 'Never'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-steel-500">
              Business figures roll up from orders and payments, which arrive in a later phase.
            </p>
          </Section>

          <Section title={`Contacts (${customer.contacts?.length || 0})`}>
            {customer.contacts?.length ? (
              <ul className="space-y-2">
                {customer.contacts.map((contact) => (
                  <ContactCard key={contact._id || contact.name} contact={contact} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-steel-500">No contacts recorded.</p>
            )}
          </Section>
        </div>
      </div>

      <Modal open={editing} title={`Edit ${customer.name}`} size="lg" onClose={() => setEditing(false)}>
        <CustomerForm customer={customer} onClose={() => setEditing(false)} onSaved={reload} />
      </Modal>
    </div>
  );
}
