import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { customers as customersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Facts, FormError, Modal, PageHeader, Section, Spinner } from '../components/ui.jsx';
import Documents from '../components/Documents.jsx';
import CustomerQueries from '../components/CustomerQueries.jsx';
import CustomerMap from '../components/CustomerMap.jsx';
import ViewSwitch from '../components/ViewSwitch.jsx';
import { useViewMode } from '../hooks/useBoard.js';
import HistoryPanel from '../components/HistoryPanel.jsx';
import { accuracyLabel, directionsUrl, mapsUrl, placeLabel } from '../utils/maps.js';
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber } from '../utils/format.js';
import {
  CUSTOMER_TYPES, SAMPLE_PURPOSES, SOURCES, leadStageLabel, optionLabel, ownsRecord, sampleStageLabel,
  stageLabel,
} from '../utils/pipeline.js';
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
  const { canRead, canWrite, user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [siteError, setSiteError] = useState(null);
  /*
   * List or map, remembered per person. The list stays the default and stays complete: exact
   * figures, sorting and copying a number out are what the tables are for, and they are also
   * what a keyboard and a screen reader can work with. The map answers the other question —
   * where has this buyer got to — which no single table can.
   */
  const [mode, setMode] = useViewMode('customer-detail');

  const fetch = useCallback((customerId) => customersApi.get(customerId), []);
  const { data, loading, error, reload } = useRecord(fetch, id);

  if (loading) return <Spinner label="Loading customer" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { customer, timeline } = data;
  /*
   * The module grant *and* the account. A customer can reach somebody's screen through a query
   * that shared it with them — which lets them read it, not change it — and the server refuses
   * that edit. Offering the button anyway ended in "Customer not found" while the customer was
   * on the screen. Found by the audit: a second marketing person, sharing a thread about a
   * colleague's buyer, could press Edit and Save and be told the buyer did not exist.
   */
  const mayWrite = canWrite('customers') && ownsRecord(user, customer);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={customer.name}
        subtitle={`${customer.code} · ${optionLabel(CUSTOMER_TYPES, customer.customerType)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge status={customer.status} />
            <ViewSwitch
              mode={mode}
              onChange={setMode}
              options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]}
            />
            {mayWrite && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
        }
      />

      {/* The map replaces the columns rather than sitting above them: a picture of the whole
          relationship and then the same records again as tables is one screen saying everything
          twice, and the reader has just chosen which of the two they wanted. */}
      {mode === 'map' && (
        <div className="card p-4">
          <CustomerMap customer={customer._id} name={customer.name} />
        </div>
      )}

      <div className={`grid gap-5 lg:grid-cols-3 ${mode === 'map' ? 'hidden' : ''}`}>
        <div className="min-w-0 space-y-5 lg:col-span-2">
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

          {/*
            The buyer's gate, pinned from somebody who stood at it.

            Only ever from a check-in shared in a thread — never typed — so it says who pinned it
            and when, and links back to the thread it came from. That provenance is the pin's
            whole claim to being right: a wrong one sends a lorry forty minutes the wrong way, and
            this is where somebody checks it before setting off.

            Nothing is drawn when there is no pin; the address above is what the plant has, and
            an empty "Site" box would read as something missing rather than something not yet done.
          */}
          {customer.site && (
            <Section
              title="Site"
              actions={
                /* The owner's, like the pin itself — offered to nobody the server would refuse. */
                mayWrite && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-steel-500 hover:text-danger-400"
                    onClick={async () => {
                      /* Somebody stood at that gate to make this. One accidental press should not
                         be the end of it — it can be re-pinned from the thread, but only if the
                         person knows to go and look. */
                      if (!window.confirm(`Remove ${customer.name}’s site pin? It can be pinned again from the check-in in its thread.`)) return;
                      setSiteError(null);
                      try {
                        await customersApi.clearSite(customer._id);
                        reload();
                      } catch (failure) {
                        setSiteError(failure);
                      }
                    }}
                  >
                    Remove the pin
                  </button>
                )
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-steel-100">
                    📍 {customer.site.place?.name ? placeLabel(customer.site) : 'Pinned location'}
                  </p>
                  <p className="mt-0.5 text-xs text-steel-500">
                    {[
                      accuracyLabel(customer.site.accuracyM),
                      customer.site.setBy?.name && `pinned by ${customer.site.setBy.name}`,
                      customer.site.setAt && formatDate(customer.site.setAt),
                    ].filter(Boolean).join(' · ')}
                    {' · '}
                    <Link to={`/queries/${customer.site.fromQuery}`} className="text-accent hover:underline">
                      from this check-in
                    </Link>
                  </p>
                  <p className="mt-0.5 font-mono text-[0.7rem] text-steel-600">
                    {Number(customer.site.lat).toFixed(5)}, {Number(customer.site.lng).toFixed(5)}
                  </p>
                  <FormError error={siteError} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <a className="btn-secondary" href={mapsUrl(customer.site)} target="_blank" rel="noopener noreferrer">
                    Open in Google Maps ↗
                  </a>
                  <a className="btn-primary" href={directionsUrl(customer.site)} target="_blank" rel="noopener noreferrer">
                    Directions ↗
                  </a>
                </div>
              </div>
            </Section>
          )}

          {/*
            Where a question about this buyer actually starts — somebody is on this screen
            because the buyer has rung. Gated on the module rather than drawn and refused: a
            department without the grant should not be shown a panel that answers 403.
          */}
          {canRead('queries') && <CustomerQueries customer={customer._id} name={customer.name} />}

          {/* The count is the customer's whole history; the table is the most recent page of
              it. Saying "10" when they have sixty is the screen disagreeing with the books. */}
          <Section title={`Enquiry history (${timeline.total ?? timeline.enquiries.length})`}>
            {timeline.enquiries.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-3 py-2.5">Enquiry</th>
                      <th className="px-3 py-2.5">Model</th>
                      <th className="px-3 py-2.5">Colour</th>
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
                        <td className="px-3 py-3 text-steel-300">
                          {enquiry.requirement?.colour || '—'}
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

            {timeline.total > timeline.enquiries.length && (
              <p className="mt-3 text-center text-xs text-steel-500">
                Showing the {timeline.enquiries.length} most recent of {timeline.total}.{' '}
                <Link
                  to={`/enquiries?customer=${customer._id}`}
                  className="font-semibold text-steel-300 hover:text-accent"
                >
                  See them all
                </Link>
              </p>
            )}
          </Section>

          {/* §2 asks for the whole story on one screen. Each strand joins as its module
              lands; quotations, orders, dispatch and payments follow. */}
          <Section title={`Samples (${timeline.sampleTotal ?? timeline.samples?.length ?? 0})`}>
            {timeline.samples?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-3 py-2.5">Sample</th>
                      <th className="px-3 py-2.5">Model</th>
                      <th className="px-3 py-2.5">For</th>
                      <th className="px-3 py-2.5 text-right">Qty</th>
                      <th className="px-3 py-2.5">Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/[0.04]">
                    {timeline.samples.map((sample) => (
                      <tr key={sample._id} className="row-hover">
                        <td className="px-3 py-3">
                          <Link
                            to={`/samples/${sample._id}`}
                            className="font-semibold text-steel-100 hover:text-accent"
                          >
                            {sample.number}
                          </Link>
                          <p className="text-xs text-steel-400">{formatDate(sample.requestedAt)}</p>
                        </td>
                        <td className="px-3 py-3 text-steel-200">{sample.modelNumber || '—'}</td>
                        <td className="px-3 py-3 text-steel-400">
                          {optionLabel(SAMPLE_PURPOSES, sample.purpose)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-steel-200">
                          {formatNumber(sample.quantity)}
                        </td>
                        <td className="px-3 py-3">
                          <Badge status={sample.status}>{sampleStageLabel(sample.status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-steel-500">
                No samples for this customer yet.
              </p>
            )}

            {timeline.sampleTotal > (timeline.samples?.length || 0) && (
              <p className="mt-3 text-center text-xs text-steel-500">
                Showing the {timeline.samples.length} most recent of {timeline.sampleTotal}.
              </p>
            )}
          </Section>
          {/*
            * Where this customer came from, and what else turned out to be them.
            *
            * Drawn only when there is something to show, because most customers were entered
            * directly and a permanently empty panel teaches people to stop reading the column.
            * A customer is created from at most one lead but can have any number attached later
            * — the same buyer arriving again through the website or IndiaMART — so this is a
            * list rather than a line.
            */}
          {timeline.leads?.length > 0 && (
            <Section title={`Came from ${timeline.leads.length === 1 ? 'a lead' : 'leads'}`}>
              <ul className="divide-y divide-line/[0.04]">
                {timeline.leads.map((lead) => (
                  <li key={lead._id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <Link
                        to={`/leads/${lead._id}`}
                        className="text-sm font-semibold text-steel-100 hover:text-accent"
                      >
                        {lead.company}
                      </Link>
                      <span className="text-xs text-steel-400">
                        {lead.number}
                        {lead.convertedAt ? ` · ${formatDate(lead.convertedAt)}` : ''}
                      </span>
                    </div>
                    {/*
                      * The rung it stood on when it closed. Worth showing rather than hiding:
                      * a lead converted straight off the rank reads differently from one
                      * somebody actually qualified, and that difference is the whole reason
                      * the stage is recorded.
                      */}
                    {lead.convertedFromStatus && (
                      <p className="mt-0.5 text-xs text-steel-500">
                        Converted from {leadStageLabel(lead.convertedFromStatus).toLowerCase()}
                        {lead.convertedEnquiry ? ', with an enquiry' : ', with no enquiry raised'}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* §27: the buyer's drawing and their signed approvals belong on the record, not
              in somebody's inbox. */}
          <Documents collection="customers" id={customer._id} canWrite={mayWrite} />

          <HistoryPanel model="Customer" id={customer._id} refreshKey={customer.updatedAt} />
        </div>

        <div className="space-y-5">
          <Section title="Business">
            <dl className="space-y-4">
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.08em] text-steel-500">
                  Total business
                </dt>
                <dd className="stat-value mt-1">{formatCompactCurrency(customer.totalBusinessValue)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.08em] text-steel-500">
                  Outstanding
                </dt>
                <dd className={`stat-value mt-1 ${customer.outstandingAmount > 0 ? '!text-warn-400' : ''}`}>
                  {formatCompactCurrency(customer.outstandingAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.08em] text-steel-500">
                  Last order
                </dt>
                <dd className="mt-1 text-sm text-steel-200">
                  {customer.lastOrderDate ? formatDate(customer.lastOrderDate) : 'Never'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-steel-500">
              Business value comes from non-cancelled orders. Outstanding reflects invoices and advances after recorded payments.
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
