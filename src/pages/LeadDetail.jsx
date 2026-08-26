import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { leads as leadsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import EnquiryFields from '../components/EnquiryFields.jsx';
import { formatCompactCurrency, formatDate, formatNumber } from '../utils/format.js';
import {
  ACTIVITY_TYPES, CUSTOMER_TYPES, DISQUALIFY_REASONS, SOURCES,
  buildEnquiryPayload, followUpState, leadStageLabel, optionLabel, text,
} from '../utils/pipeline.js';

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/**
 * Logging contact is itself progress: the server moves a `new` lead to `contacted` as soon
 * as the first activity lands, so this form is the main way a lead advances.
 */
function ActivityForm({ leadId, onSaved }) {
  const [type, setType] = useState('call');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!summary.trim()) return;

    setBusy(true);
    setError(null);
    try {
      onSaved(await leadsApi.addActivity({ id: leadId, type, summary: summary.trim() }));
      setSummary('');
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-5 space-y-2">
      <div className="flex gap-2">
        <select
          className="input w-32"
          aria-label="Activity type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          {ACTIVITY_TYPES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          className="input flex-1"
          placeholder="What happened?"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={busy || !summary.trim()}>
          Log
        </button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </form>
  );
}

/** Converting writes a customer, its first contact and optionally the first enquiry at once. */
function ConvertForm({ lead, onClose, onConverted }) {
  const [error, setError] = useState(null);
  const [withEnquiry, setWithEnquiry] = useState(true);
  const [product, setProduct] = useState(undefined);
  const [isNewDevelopment, setNewDevelopment] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      customer: {
        name: lead.company,
        customerType: 'garment_factory',
        rating: 'B',
        city: lead.city,
        state: lead.state,
        mobile: lead.mobile,
        email: lead.email,
      },
      enquiry: { requirement: { modelNumber: '' } },
    },
  });

  const submit = async (values) => {
    setError(null);

    if (withEnquiry && !product && !isNewDevelopment) {
      setError({ message: 'Pick a model from the catalogue, or mark the enquiry as a new development.' });
      return;
    }

    const payload = {
      customer: {
        name: values.customer.name,
        customerType: values.customer.customerType,
        rating: values.customer.rating,
        city: text(values.customer.city),
        state: text(values.customer.state),
        mobile: text(values.customer.mobile),
        email: text(values.customer.email),
        gstin: text(values.customer.gstin),
        paymentTerms: text(values.customer.paymentTerms),
      },
      enquiry: withEnquiry
        ? buildEnquiryPayload(values.enquiry, { product, isNewDevelopment })
        : undefined,
    };

    try {
      onConverted(await leadsApi.convert({ id: lead._id, ...payload }));
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      <Notice tone="info">
        The customer keeps this lead&rsquo;s owner, so converting never quietly moves a
        relationship. A customer already matching on GST or phone blocks the conversion —
        raise the enquiry against that record instead.
      </Notice>

      <div>
        <p className="eyebrow mb-3">The customer</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" error={errors.customer?.name} className="sm:col-span-2">
            <input className="input" {...register('customer.name', { required: 'Company name is required' })} />
          </Field>
          <Field label="Customer type">
            <select className="input" {...register('customer.customerType')}>
              {CUSTOMER_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Rating">
            <select className="input" {...register('customer.rating')}>
              <option value="A">A — key account</option>
              <option value="B">B — regular</option>
              <option value="C">C — occasional</option>
            </select>
          </Field>
          <Field label="GST number">
            <input className="input uppercase" {...register('customer.gstin')} />
          </Field>
          <Field label="Payment terms">
            <input className="input" {...register('customer.paymentTerms')} />
          </Field>
          <Field label="Mobile">
            <input type="tel" className="input" {...register('customer.mobile')} />
          </Field>
          <Field label="Email">
            <input type="email" className="input" {...register('customer.email')} />
          </Field>
          <Field label="City">
            <input className="input" {...register('customer.city')} />
          </Field>
          <Field label="State">
            <input className="input" {...register('customer.state')} />
          </Field>
        </div>
      </div>

      <div className="border-t border-line/[0.06] pt-5">
        <label className="mb-4 flex items-start gap-2.5 text-sm text-steel-200">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-flame-500"
            checked={withEnquiry}
            onChange={(event) => setWithEnquiry(event.target.checked)}
          />
          <span>
            Raise the first enquiry now
            <span className="mt-0.5 block text-xs text-steel-500">
              Untick if the buyer is worth keeping but has no firm requirement yet.
            </span>
          </span>
        </label>

        {withEnquiry && (
          <EnquiryFields
            register={register}
            prefix="enquiry."
            errors={errors.enquiry}
            product={product}
            onProductChange={setProduct}
            newDevelopment={isNewDevelopment}
            onNewDevelopmentChange={setNewDevelopment}
          />
        )}
      </div>

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
          {isSubmitting ? 'Converting…' : 'Convert to customer'}
        </button>
      </div>
    </form>
  );
}

function DisqualifyForm({ lead, onClose, onSaved }) {
  const [reason, setReason] = useState('not_our_product');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await leadsApi.update({
          id: lead._id,
          status: 'disqualified',
          disqualifyReason: reason,
          disqualifyNote: note || undefined,
        })
      );
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Reason">
        <select className="input" value={reason} onChange={(event) => setReason(event.target.value)}>
          {DISQUALIFY_REASONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Note" hint="Optional, but the next person will thank you">
        <textarea rows={2} className="input" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-danger" disabled={busy}>
          {busy ? 'Saving…' : 'Disqualify'}
        </button>
      </div>
    </form>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const [converting, setConverting] = useState(false);
  const [disqualifying, setDisqualifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetch = useCallback((leadId) => leadsApi.get(leadId), []);
  const { data: lead, setData, loading, error, reload } = useRecord(fetch, id);

  if (loading) return <Spinner label="Loading lead" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!lead) return null;

  const mayWrite = canWrite('enquiries');
  const open = !['converted', 'disqualified'].includes(lead.status);
  const due = followUpState(lead.nextFollowUpDate);

  const qualify = async () => {
    setBusy(true);
    setActionError(null);
    try {
      setData(await leadsApi.update({ id: lead._id, status: 'qualified' }));
    } catch (updateError) {
      setActionError(updateError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={lead.company}
        subtitle={`${lead.number} · ${optionLabel(SOURCES, lead.source)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={lead.status}>{leadStageLabel(lead.status)}</Badge>
            {mayWrite && open && (
              <>
                {lead.status !== 'qualified' && (
                  <button type="button" className="btn-secondary" onClick={qualify} disabled={busy}>
                    Mark qualified
                  </button>
                )}
                <button type="button" className="btn-ghost" onClick={() => setDisqualifying(true)}>
                  Disqualify
                </button>
                <button type="button" className="btn-primary" onClick={() => setConverting(true)}>
                  Convert to customer
                </button>
              </>
            )}
          </div>
        }
      />

      {actionError && (
        <div className="mb-5">
          <Notice tone="danger">{actionError}</Notice>
        </div>
      )}

      {lead.status === 'converted' && (
        <div className="mb-5">
          <Notice tone="success">
            Converted on {formatDate(lead.convertedAt)} into{' '}
            <Link to={`/customers/${lead.convertedCustomer?._id}`} className="font-semibold underline">
              {lead.convertedCustomer?.name}
            </Link>
            {lead.convertedEnquiry && (
              <>
                {' '}with enquiry{' '}
                <Link to={`/enquiries/${lead.convertedEnquiry._id}`} className="font-semibold underline">
                  {lead.convertedEnquiry.number}
                </Link>
              </>
            )}
            .
          </Notice>
        </div>
      )}

      {lead.status === 'disqualified' && (
        <div className="mb-5">
          <Notice tone="warn">
            Disqualified — {optionLabel(DISQUALIFY_REASONS, lead.disqualifyReason)}
            {lead.disqualifyNote && `. ${lead.disqualifyNote}`}
          </Notice>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Details">
            <Facts
              items={[
                { label: 'Contact', value: [lead.contactName, lead.designation].filter(Boolean).join(' · ') },
                { label: 'Owner', value: lead.assignedTo?.name },
                { label: 'Mobile', value: lead.mobile },
                { label: 'Email', value: lead.email },
                { label: 'Location', value: [lead.city, lead.state].filter(Boolean).join(', ') },
                { label: 'Estimated quantity', value: lead.estimatedQuantity && `${formatNumber(lead.estimatedQuantity)} pcs` },
                { label: 'Estimated value', value: lead.estimatedValue && formatCompactCurrency(lead.estimatedValue) },
                { label: 'What they are after', value: lead.productInterest, wide: true },
                { label: 'Notes', value: lead.notes, wide: true },
              ]}
            />
          </Section>

          <Section title={`Activity (${lead.activities?.length || 0})`}>
            {mayWrite && open && <ActivityForm leadId={lead._id} onSaved={setData} />}

            {lead.activities?.length ? (
              <ol className="space-y-3">
                {[...lead.activities].reverse().map((activity) => (
                  <li key={activity._id} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-flame-500" />
                    <div className="min-w-0">
                      <p className="text-sm text-steel-100">{activity.summary}</p>
                      <p className="text-xs text-steel-500">
                        {optionLabel(ACTIVITY_TYPES, activity.type)} · {formatDate(activity.occurredAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-steel-500">Nothing logged yet.</p>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="Next step">
            {open ? (
              <>
                <p className="text-sm text-steel-100">{lead.nextAction || 'No next action set'}</p>
                {due && <p className={`mt-1 text-xs font-semibold ${TONE_TEXT[due.tone]}`}>{due.text}</p>}
                {lead.nextFollowUpDate && (
                  <p className="mt-0.5 text-xs text-steel-500">{formatDate(lead.nextFollowUpDate)}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-steel-500">This lead is closed — nothing left to chase.</p>
            )}
          </Section>

          {/* Guidance while there is still something to do; nothing once the lead has closed. */}
          {open && (
            <Section title="How conversion works">
              <ol className="space-y-2.5 text-[0.8125rem] leading-relaxed text-steel-400">
                <li>1. Log what happened — the lead moves off &ldquo;new&rdquo; on its own.</li>
                <li>2. Mark it qualified once the volume and the buyer are real.</li>
                <li>3. Convert: the customer, its first contact and the first enquiry are all created at once, so nothing is re-keyed.</li>
              </ol>
            </Section>
          )}
        </div>
      </div>

      <Modal
        open={converting}
        title="Convert to customer"
        description="Check the details carried over from the lead before creating the record"
        size="lg"
        onClose={() => setConverting(false)}
      >
        <ConvertForm
          lead={lead}
          onClose={() => setConverting(false)}
          onConverted={(result) => {
            setConverting(false);
            navigate(`/customers/${result.customer._id}`);
          }}
        />
      </Modal>

      <Modal open={disqualifying} title="Disqualify lead" size="sm" onClose={() => setDisqualifying(false)}>
        <DisqualifyForm lead={lead} onClose={() => setDisqualifying(false)} onSaved={setData} />
      </Modal>
    </div>
  );
}
