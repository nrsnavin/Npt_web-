import { useCallback, useState } from 'react';
import { AskLocation } from '../components/QcFlag.jsx';
import { Link, useParams } from 'react-router-dom';
import { customers as customersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Facts, Field, FormError, Modal, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import Documents from '../components/Documents.jsx';
import CustomerQueries from '../components/CustomerQueries.jsx';
import CustomerMap from '../components/CustomerMap.jsx';
import ViewSwitch from '../components/ViewSwitch.jsx';
import { useViewMode } from '../hooks/useBoard.js';
import HistoryPanel from '../components/HistoryPanel.jsx';
import { accuracyLabel, directionsUrl, mapsUrl, placeLabel } from '../utils/maps.js';
import { formatCompactCurrency, formatCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';
import {
  CREDIT_STATUSES, CUSTOMER_TYPES, SAMPLE_PURPOSES, SOURCES, creditLabel, creditStatusOf, optionLabel, ownsRecord, sampleStageLabel,
  stageLabel,
} from '../utils/pipeline.js';
import { CustomerForm } from './Customers.jsx';
import { gstUnknown } from '../utils/gst.js';
import CustomerTimeline from '../components/CustomerTimeline.jsx';

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

/**
 * Admin's word on the buyer's credit [server: models/Customer.js `credit`]: Watch or Hold by
 * hand with the reason, or cleared so the rule's own reading shows again. A Hold warns on the
 * enquiry, the SO and the dispatch request — it never stops them; the payment gate does that.
 */
function CreditDialog({ customer, onClose, onSaved }) {
  const [status, setStatus] = useState(customer.credit?.override?.status || creditStatusOf(customer));
  const [reason, setReason] = useState(customer.credit?.override?.reason || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async (event, clear = false) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await customersApi.setCredit(clear ? { id: customer._id } : { id: customer._id, status, reason: reason.trim() });
      onSaved();
      onClose();
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  };
  return (
    <Modal open title="Credit status" description={`${customer.name} — the rule says ${creditLabel(customer.credit?.derived?.status || 'good').toLowerCase()}${customer.credit?.derived?.reason ? ` (${customer.credit.derived.reason})` : ''}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Admin says">
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
            {CREDIT_STATUSES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
        </Field>
        <Field label="Why" required hint="The marketing person and the buyer will both ask">
          <textarea rows={3} className="input" value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
        </Field>
        <p className="text-xs text-steel-500">A hold warns on new enquiries, sales orders and dispatch requests for this buyer. It does not stop them — the order’s payment terms do that.</p>
        {error && <FormError error={error} />}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line/[0.06] pt-4">
          {customer.credit?.override?.status && (
            <button type="button" className="btn-secondary mr-auto" disabled={busy} onClick={(event) => save(event, true)}>Clear — back to the rule</button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const { canRead, canWrite, user, isManagement } = useAuth();
  const [editing, setEditing] = useState(false);
  const [crediting, setCrediting] = useState(false);
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
  /* A salesperson on another salesperson's buyer: here only because a query about them is theirs. */
  const fromQuery = !ownsRecord(user, customer);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={customer.name}
        subtitle={`${customer.code} · ${optionLabel(CUSTOMER_TYPES, customer.customerType)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge status={customer.status} />
            {/* How the buyer pays, from the rule or from Admin — Admin may change it from here. */}
            {(creditStatusOf(customer) !== 'good' || isManagement) && (
              isManagement ? (
                <button
                  type="button"
                  className="inline-flex"
                  title={customer.credit?.override?.reason || customer.credit?.derived?.reason || 'Set the credit status'}
                  onClick={() => setCrediting(true)}
                >
                  <Badge tone={CREDIT_STATUSES.find((entry) => entry.key === creditStatusOf(customer))?.tone}>{creditLabel(creditStatusOf(customer))}{customer.credit?.override?.status ? ' · Admin' : ''}</Badge>
                </button>
              ) : (
                <span title={customer.credit?.override?.reason || customer.credit?.derived?.reason || ''}>
                  <Badge tone={CREDIT_STATUSES.find((entry) => entry.key === creditStatusOf(customer))?.tone}>{creditLabel(creditStatusOf(customer))}</Badge>
                </span>
              )
            )}
            <ViewSwitch
              mode={mode}
              onChange={setMode}
              options={[
                { value: 'list', label: 'Details' },
                { value: 'timeline', label: 'Timeline' },
                { value: 'map', label: 'Map' },
              ]}
            />
            {mayWrite && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
        }
      />

      {/* The GST split on this buyer's orders needs their state [server: utils/gst.js `placeOfSupplyFor`]: without one, or a GSTIN, it assumes the plant's own. */}
      {gstUnknown(customer) && (
        <Notice tone="warn">
          No state or GSTIN on record — GST on this buyer's orders assumes Tamil Nadu (CGST + SGST) until one is given.
          {mayWrite && (
            <button type="button" className="ml-2 font-semibold underline" onClick={() => setEditing(true)}>Add the state or GSTIN</button>
          )}
        </Notice>
      )}

      {fromQuery && (
        <Notice tone="info">
          Opened from a query about this buyer — read only. {customer.assignedTo?.name ? `${customer.assignedTo.name} holds this customer; ` : ''}
          its enquiries and samples are not shown, and it is not in your customer list.
        </Notice>
      )}

      {/* The map replaces the columns rather than sitting above them: a picture of the whole
          relationship and then the same records again as tables is one screen saying everything
          twice, and the reader has just chosen which of the two they wanted. */}
      {/* Everything about the buyer on one scroll, newest first. */}
      {mode === 'timeline' && <CustomerTimeline customerId={customer._id} />}

      {mode === 'map' && (
        <div className="card p-4">
          <CustomerMap customer={customer._id} name={customer.name} />
        </div>
      )}

      <div className={`grid gap-5 lg:grid-cols-3 ${mode !== 'list' ? 'hidden' : ''}`}>
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Section title="Details">
            <Facts
              items={[
                { label: 'Owner', value: customer.assignedTo?.name },
                { label: 'Rating', value: customer.rating && `${customer.rating} grade` },
                { label: 'Address', value: [customer.address, customer.area, customer.pincode].filter(Boolean).join(', ') || undefined },
                { label: 'Landmark', value: customer.landmark || undefined },
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
                    {customer.site.source === 'whatsapp' ? (
                      <span>shared by the buyer on WhatsApp</span>
                    ) : (
                      <Link to={`/queries/${customer.site.fromQuery}`} className="text-accent hover:underline">
                        from this check-in
                      </Link>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[0.75rem] text-steel-600">
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
          {/* No pin yet: ask the buyer to share their location on WhatsApp — it is pinned when they do. */}
          {!customer.site && mayWrite && (
            <Section title="Site">
              <p className="text-sm text-steel-400">No delivery pin yet. <AskLocation customerId={customer._id} /></p>
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
          {/* The quotations made for this buyer — every one for Admin, their own for a marketing
              person — with the rate on each model and never the cost. Shown to whoever may read
              quotations at all; the server leaves the strand out for the rest. */}
          {timeline.quotations && (
            <Section
              title={`Quotations (${timeline.quotationTotal ?? timeline.quotations.length})`}
              actions={timeline.quotations.length > 0 && <Link to={`/quotations?customer=${customer._id}`} className="text-sm font-semibold text-accent hover:underline">All quotations</Link>}
            >
              {timeline.quotations.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="table-head">
                      <tr>
                        <th className="px-3 py-2.5">Quotation</th>
                        <th className="px-3 py-2.5">Models · rate</th>
                        <th className="px-3 py-2.5">Enquiry</th>
                        <th className="px-3 py-2.5">Valid until</th>
                        <th className="px-3 py-2.5">Stage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/[0.04]">
                      {timeline.quotations.map((quotation) => (
                        <tr key={quotation._id} className="row-hover">
                          <td className="px-3 py-3">
                            <Link to={`/quotations/${quotation._id}`} className="font-semibold text-steel-100 hover:text-accent">
                              {quotation.number}{quotation.revision > 1 ? ` · rev ${quotation.revision}` : ''}
                            </Link>
                            <p className="text-xs text-steel-400">{formatDate(quotation.sentAt || quotation.createdAt)}{quotation.sentAt ? ' · sent' : ''}</p>
                          </td>
                          <td className="px-3 py-3 text-steel-200">
                            {quotation.lines.length
                              ? quotation.lines.map((line, index) => (
                                <p key={`${line.modelNumber || 'model'}-${index}`} className="tabular-nums">
                                  {line.modelNumber || 'Model'}{line.unitPrice != null ? ` · ${formatCurrency(line.unitPrice)}` : ''}
                                </p>
                              ))
                              : '—'}
                          </td>
                          <td className="px-3 py-3">
                            {quotation.enquiry
                              ? <Link to={`/enquiries/${quotation.enquiry._id}`} className="text-steel-300 hover:text-accent">{quotation.enquiry.number}</Link>
                              : <span className="text-steel-500">—</span>}
                          </td>
                          <td className="px-3 py-3 text-steel-400">{quotation.validUntil ? formatDate(quotation.validUntil) : '—'}</td>
                          <td className="px-3 py-3"><Badge status={quotation.status}>{humanise(quotation.status)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-steel-500">No quotation for this customer yet.</p>
              )}
              {timeline.quotationTotal > timeline.quotations.length && (
                <p className="mt-3 text-center text-xs text-steel-500">
                  Showing the {timeline.quotations.length} most recent of {timeline.quotationTotal}.
                </p>
              )}
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
      {crediting && <CreditDialog customer={customer} onClose={() => setCrediting(false)} onSaved={reload} />}
    </div>
  );
}
