import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { leads as leadsApi, samples as samplesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import LeadLog from '../components/LeadLog.jsx';
import EnquiryFields from '../components/EnquiryFields.jsx';
import SampleRequestForm from '../components/SampleRequestForm.jsx';
import { formatCompactCurrency, formatDate, formatNumber } from '../utils/format.js';
import {
  ACTIVITY_TYPES, CUSTOMER_TYPES, DISQUALIFY_REASONS, SOURCES,
  buildEnquiryPayload, followUpState, leadStageLabel, optionLabel, sampleStageLabel, text,
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
function ConvertForm({ lead, onClose, onConverted, startWithEnquiry = true }) {
  const [error, setError] = useState(null);
  const [withEnquiry, setWithEnquiry] = useState(startWithEnquiry);
  const [product, setProduct] = useState(undefined);
  const [isNewDevelopment, setNewDevelopment] = useState(false);
  /*
   * The customer this lead turned out to be, when it is one we already supply.
   *
   * Offered by the server on the duplicate refusal rather than picked out of the air: the check
   * that used to be a dead end now hands back the record it matched, and this is where that
   * answer lands. Choosing one switches the whole dialog from "make a customer" to "use this
   * one", because those are two different actions and the server refuses a request asking for
   * both.
   */
  const [attachTo, setAttachTo] = useState(null);

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
      /* One or the other — see `attachTo`. The server refuses a request carrying both. */
      ...(attachTo
        ? { existingCustomer: attachTo.id }
        : {
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
          }),
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
      {/*
        * Where the lead stood when it was converted [R2].
        *
        * Said, not refused. A rule with no legitimate escape is one people work around at the
        * counter — most likely by ticking "qualified" without qualifying anything, which is
        * worse than no rule and unmeasurable besides. The stage is kept on the record either
        * way, so how often this is skipped becomes a number rather than an impression.
        */}
      {lead.status !== 'qualified' && !attachTo && (
        <Notice tone="warn">
          This lead is still {leadStageLabel(lead.status).toLowerCase()} — nobody has marked it
          qualified. You can convert it anyway; the stage it was at is kept on the record.
        </Notice>
      )}

      {attachTo ? (
        <Notice tone="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Attaching to <strong>{attachTo.name}</strong> ({attachTo.code}) — no second customer
              record is made, and the enquiry goes onto theirs.
            </span>
            <button
              type="button"
              className="row-action shrink-0"
              onClick={() => setAttachTo(null)}
            >
              Make a new customer instead
            </button>
          </div>
        </Notice>
      ) : (
        <Notice tone="info">
          The customer keeps this lead&rsquo;s owner, so converting never quietly moves a
          relationship. If a customer already matches on GST or phone, you will be offered that
          record instead of a second one.
        </Notice>
      )}

      {/*
        * The refusal, turned into the action it advises.
        *
        * The server hands the matching customer back with the 409, so this is a button rather
        * than a sentence telling somebody to go and look. It is the whole reason the duplicate
        * check stopped being a dead end.
        */}
      {error?.details?.customer && !attachTo && (
        <Notice tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error.message}</span>
            <button
              type="button"
              className="btn-secondary shrink-0"
              onClick={() => {
                setAttachTo(error.details.customer);
                setError(null);
              }}
            >
              Attach to {error.details.customer.name}
            </button>
          </div>
        </Notice>
      )}

      {!attachTo && (
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
      )}

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

      {/* Not the duplicate conflict — that has its own block above, with the button. */}
      {error && !error.details?.customer && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {Array.isArray(error.details) &&
            error.details.map((detail) => (
              <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
            ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving…'
            : attachTo
              ? `Attach to ${attachTo.code}`
              : withEnquiry
                ? 'Create customer and enquiry'
                : 'Create customer'}
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
          expectedUpdatedAt: lead.updatedAt,
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

/**
 * What has been made for this lead, and the door to asking for more.
 *
 * A buyer asking for a sample is often the *first* thing that happens, well before there is a
 * customer or an enquiry — so the request has to be visible from the only record that exists at
 * that point. Without this the sample was raised somewhere else and the lead gave no sign it
 * had ever been sent, which is how the same one gets promised twice.
 */
function LeadSamples({ lead, mayWrite }) {
  const [asking, setAsking] = useState(false);
  const { data, loading, error, reload } = useRecordList(samplesApi.list, {
    lead: lead._id,
    limit: 20,
  });

  const open = !['converted', 'disqualified'].includes(lead.status);

  return (
    <Section
      title="Samples"
      actions={
        /*
         * Offered only while the lead is still one. A converted lead's work has moved to the
         * customer and the server says so; a disqualified one is not having anything made.
         * Drawing the button anyway would be a control whose only outcome is a refusal.
         */
        mayWrite && open ? (
          <button type="button" className="row-action" onClick={() => setAsking(true)}>
            Request a sample
          </button>
        ) : null
      }
    >
      {loading && <Spinner label="Loading samples" />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <p className="text-sm text-steel-500">
          {open
            ? 'Nothing made for this lead yet.'
            : 'No samples were made for this lead.'}
        </p>
      ) : (
        <ul className="divide-y divide-line/[0.04]">
          {data.map((sample) => (
            <li key={sample._id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/samples/${sample._id}`}
                    className="text-sm font-semibold text-steel-100 hover:text-accent"
                  >
                    {sample.number}
                  </Link>
                  <p className="truncate text-xs text-steel-400">
                    {sample.product?.modelCode || sample.modelNumber || 'New development'}
                    {sample.colour ? ` · ${sample.colour}` : ''} · {formatNumber(sample.quantity)} pcs
                  </p>
                  {/*
                    * Where it went after the lead converted. Worth saying here rather than only
                    * on the sample: it is the line that explains why a request raised against a
                    * lead now names a buyer.
                    */}
                  {sample.customer && (
                    <p className="mt-0.5 text-xs text-steel-500">
                      Now against{' '}
                      <Link to={`/customers/${sample.customer._id}`} className="hover:text-accent">
                        {sample.customer.name}
                      </Link>
                    </p>
                  )}
                </div>
                <Badge status={sample.status}>{sampleStageLabel(sample.status)}</Badge>
              </div>
            </li>
          ))}
        </ul>
      ))}

      {/*
        * No description: the form's own first line already names the company and says what
        * happens on conversion, and the two sat one above the other saying the same sentence
        * twice. The form carries it because it is true wherever the form is used.
        */}
      <Modal open={asking} title="Request a sample" size="lg" onClose={() => setAsking(false)}>
        <SampleRequestForm lead={lead} onClose={() => setAsking(false)} onSaved={reload} />
      </Modal>
    </Section>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const [converting, setConverting] = useState(false);
  /* Which door was used, so the dialog opens with the enquiry section already expanded. */
  const [enquiryFirst, setEnquiryFirst] = useState(true);
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
      setData(await leadsApi.update({ id: lead._id, expectedUpdatedAt: lead.updatedAt, status: 'qualified' }));
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
        /*
         * Whose lead it is, in the line that says what this record is. It was one row among
         * nine in the details card, which is the wrong place for the question most often asked
         * about somebody else's lead. Unassigned is named rather than omitted — a lead nobody
         * owns is the thing §3 exists to prevent, and a missing line reads as nothing at all.
         */
        subtitle={`${lead.number} · ${optionLabel(SOURCES, lead.source)} · ${
          lead.assignedTo?.name ? `Owned by ${lead.assignedTo.name}` : 'Unassigned'
        }`}
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
                {/*
                  * The same action under the name people look for [R3].
                  *
                  * Converting has always raised the first enquiry — it is a tick-box inside the
                  * dialog, on by default — but the button was named after only one of the two
                  * things it does, so somebody wanting an enquiry from a lead never opened it.
                  * One route, two doors: this opens the same form with the enquiry expanded.
                  *
                  * Offered on a qualified lead, because that is the rung the funnel says comes
                  * before work starts. From anywhere else Convert is still there and still
                  * raises the enquiry, with the warning the dialog now carries.
                  */}
                {lead.status === 'qualified' && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setEnquiryFirst(true);
                      setConverting(true);
                    }}
                  >
                    Raise enquiry
                  </button>
                )}
                <button
                  type="button"
                  className={lead.status === 'qualified' ? 'btn-secondary' : 'btn-primary'}
                  onClick={() => {
                    setEnquiryFirst(true);
                    setConverting(true);
                  }}
                >
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
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Section title="Details">
            <Facts
              items={[
                { label: 'Contact', value: [lead.contactName, lead.designation].filter(Boolean).join(' · ') },
                // The owner is in the header, where the question "whose is this?" is asked.
                { label: 'Owner', value: lead.assignedTo?.name || 'Unassigned' },
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

          <LeadLog lead={lead} onSaved={setData} />

          <LeadSamples lead={lead} mayWrite={mayWrite} />

          {/* The activity log above is what was said; this is what was changed. */}
          <HistoryPanel model="Lead" id={lead._id} />
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
        title={lead.status === 'qualified' ? 'Raise the first enquiry' : 'Convert to customer'}
        description="The customer, its first contact and the enquiry are created together — check what carried over from the lead"
        size="lg"
        onClose={() => setConverting(false)}
      >
        <ConvertForm
          lead={lead}
          startWithEnquiry={enquiryFirst}
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
