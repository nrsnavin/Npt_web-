import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';
import {
  CLOSED_STAGES, ENQUIRY_STAGES, HANGER_CATEGORIES, LOST_REASONS, MATERIALS, SOURCES,
  followUpState, nextStagesFrom, numeric, optionLabel, stageLabel, text,
} from '../utils/pipeline.js';

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/**
 * Moving an enquiry between stages.
 *
 * Closing asks for a reason and drops the follow-up entirely — there is nothing left to
 * chase. Any other move insists on the next step, which is what keeps an enquiry from
 * going quiet halfway down the funnel.
 */
function StageForm({ enquiry, onClose, onSaved }) {
  const [status, setStatus] = useState(nextStagesFrom(enquiry.status)[0]?.value || '');
  const [note, setNote] = useState('');
  const [lostReason, setLostReason] = useState('price');
  const [holdReason, setHoldReason] = useState('');
  const [nextAction, setNextAction] = useState(enquiry.nextAction || '');
  const [nextFollowUpDate, setNextFollowUpDate] = useState(
    enquiry.nextFollowUpDate ? enquiry.nextFollowUpDate.slice(0, 10) : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const closing = CLOSED_STAGES.includes(status);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await enquiriesApi.setStatus({
          id: enquiry._id,
          status,
          note: note || undefined,
          lostReason: status === 'lost' ? lostReason : undefined,
          holdReason: status === 'hold' ? holdReason || undefined : undefined,
          nextAction: closing ? undefined : nextAction || undefined,
          nextFollowUpDate: closing ? undefined : nextFollowUpDate || undefined,
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
      <Field label="Move to">
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
          {nextStagesFrom(enquiry.status).map((stage) => (
            <option key={stage.value} value={stage.value}>{stage.label}</option>
          ))}
        </select>
      </Field>

      {status === 'lost' && (
        <Field label="Why was it lost">
          <select className="input" value={lostReason} onChange={(event) => setLostReason(event.target.value)}>
            {LOST_REASONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
      )}

      {status === 'hold' && (
        <Field label="Why is it on hold">
          <input className="input" value={holdReason} onChange={(event) => setHoldReason(event.target.value)} />
        </Field>
      )}

      {!closing && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next action">
            <input className="input" value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
          </Field>
          <Field label="Follow up on">
            <input
              type="date"
              className="input"
              value={nextFollowUpDate}
              onChange={(event) => setNextFollowUpDate(event.target.value)}
            />
          </Field>
        </div>
      )}

      <Field label="Note" hint="Recorded against this move in the history">
        <textarea rows={2} className="input" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {closing && (
        <Notice tone="warn">
          A {status} enquiry cannot be moved again, and its follow-up is cleared.
        </Notice>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className={closing ? 'btn-danger' : 'btn-primary'} disabled={busy || !status}>
          {busy ? 'Saving…' : `Move to ${stageLabel(status)}`}
        </button>
      </div>
    </form>
  );
}

/** A new development becomes a catalogue model once it has been developed and approved. */
function PromoteForm({ enquiry, onClose, onSaved }) {
  const [error, setError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: enquiry.requirement?.modelNumber || '',
      category: enquiry.requirement?.category || 'shirt',
      material: enquiry.requirement?.material || 'plastic',
      sizeMm: enquiry.requirement?.sizeMm || '',
      mouldAvailable: false,
    },
  });

  const submit = async (values) => {
    setError(null);
    try {
      onSaved(
        await enquiriesApi.promoteToProduct({
          id: enquiry._id,
          modelCode: values.modelCode,
          name: values.name,
          category: values.category,
          material: values.material,
          sizeMm: numeric(values.sizeMm),
          standardPrice: numeric(values.standardPrice),
          moq: numeric(values.moq),
          packingQty: numeric(values.packingQty),
          mouldAvailable: values.mouldAvailable,
          mouldNumber: text(values.mouldNumber),
        })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      <Notice tone="info">
        This keeps speculative models out of the catalogue: promote only once the buyer has
        approved what sampling produced.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model code" error={errors.modelCode} hint="Unique, e.g. NPT-400M">
          <input className="input uppercase" {...register('modelCode', { required: 'Model code is required' })} />
        </Field>
        <Field label="Name" error={errors.name}>
          <input className="input" {...register('name', { required: 'Name is required' })} />
        </Field>
        <Field label="Category">
          <select className="input" {...register('category')}>
            {HANGER_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Material">
          <select className="input" {...register('material')}>
            {MATERIALS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Size (mm)">
          <input type="number" className="input" {...register('sizeMm')} />
        </Field>
        <Field label="Standard price (₹)">
          <input type="number" step="0.01" className="input" {...register('standardPrice')} />
        </Field>
        <Field label="Minimum order quantity">
          <input type="number" className="input" {...register('moq')} />
        </Field>
        <Field label="Packing quantity">
          <input type="number" className="input" {...register('packingQty')} />
        </Field>
        <Field label="Mould number">
          <input className="input" {...register('mouldNumber')} />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-steel-200">
        <input type="checkbox" className="h-4 w-4 accent-flame-500" {...register('mouldAvailable')} />
        Mould is cut and available
      </label>

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
          {isSubmitting ? 'Adding…' : 'Add to catalogue'}
        </button>
      </div>
    </form>
  );
}

export default function EnquiryDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const [movingStage, setMovingStage] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const fetch = useCallback((enquiryId) => enquiriesApi.get(enquiryId), []);
  const { data: enquiry, setData, loading, error, reload } = useRecord(fetch, id);

  if (loading) return <Spinner label="Loading enquiry" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!enquiry) return null;

  const mayWrite = canWrite('enquiries');
  const mayWriteProducts = canWrite('products');
  const open = !CLOSED_STAGES.includes(enquiry.status);
  const due = followUpState(enquiry.nextFollowUpDate);
  const stageIndex = ENQUIRY_STAGES.findIndex((stage) => stage.value === enquiry.status);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={enquiry.number}
        subtitle={
          <>
            <Link to={`/customers/${enquiry.customer?._id}`} className="hover:text-accent">
              {enquiry.customer?.name}
            </Link>
            {' · '}
            {formatDate(enquiry.enquiryDate)}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={enquiry.status}>{stageLabel(enquiry.status)}</Badge>
            {mayWrite && enquiry.isNewDevelopment && mayWriteProducts && (
              <button type="button" className="btn-secondary" onClick={() => setPromoting(true)}>
                Add to catalogue
              </button>
            )}
            {mayWrite && open && (
              <button type="button" className="btn-primary" onClick={() => setMovingStage(true)}>
                Move stage
              </button>
            )}
          </div>
        }
      />

      {enquiry.status === 'lost' && (
        <div className="mb-5">
          <Notice tone="danger">
            Lost — {optionLabel(LOST_REASONS, enquiry.lostReason)}
            {enquiry.lostNote && `. ${enquiry.lostNote}`}
          </Notice>
        </div>
      )}
      {enquiry.status === 'hold' && enquiry.holdReason && (
        <div className="mb-5">
          <Notice tone="warn">On hold — {enquiry.holdReason}</Notice>
        </div>
      )}

      {/* The funnel position, so the stage reads as a place rather than a word. */}
      <div className="mb-5 flex gap-1" aria-hidden="true">
        {ENQUIRY_STAGES.slice(0, 8).map((stage, index) => (
          <span
            key={stage.value}
            title={stage.label}
            className={`h-1 flex-1 rounded-full ${
              index <= stageIndex && stageIndex < 8 ? 'bg-flame-500' : 'bg-line/[0.08]'
            }`}
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="Requirement">
            {enquiry.isNewDevelopment && (
              <div className="mb-4">
                <Badge tone="accent">New development — no catalogue model yet</Badge>
              </div>
            )}
            <Facts
              items={[
                {
                  label: 'Model',
                  value: enquiry.product
                    ? `${enquiry.product.modelCode} — ${enquiry.product.name}`
                    : enquiry.requirement?.modelNumber,
                  wide: true,
                },
                { label: 'Category', value: optionLabel(HANGER_CATEGORIES, enquiry.requirement?.category) },
                { label: 'Material', value: optionLabel(MATERIALS, enquiry.requirement?.material) },
                { label: 'Size', value: enquiry.requirement?.sizeMm && `${enquiry.requirement.sizeMm} mm` },
                { label: 'Colour', value: enquiry.requirement?.colour },
                { label: 'Quantity', value: `${formatNumber(enquiry.requirement?.quantity)} pcs` },
                { label: 'Target price', value: enquiry.targetPrice && formatCurrency(enquiry.targetPrice) },
                { label: 'Printing', value: enquiry.requirement?.printing },
                { label: 'Packing', value: enquiry.requirement?.packing },
                { label: 'Required by', value: enquiry.requiredDeliveryDate && formatDate(enquiry.requiredDeliveryDate) },
                { label: 'Estimated value', value: enquiry.estimatedValue && formatCurrency(enquiry.estimatedValue) },
                { label: 'Remarks', value: enquiry.remarks, wide: true },
              ]}
            />
          </Section>

          <Section title={`Stage history (${enquiry.statusHistory?.length || 0})`}>
            {enquiry.statusHistory?.length ? (
              <ol className="space-y-3">
                {[...enquiry.statusHistory].reverse().map((entry, index) => (
                  <li key={`${entry.to}-${entry.at}-${index}`} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-flame-500" />
                    <div className="min-w-0">
                      <p className="text-sm text-steel-100">
                        {entry.from ? `${stageLabel(entry.from)} → ` : 'Raised as '}
                        <span className="font-semibold">{stageLabel(entry.to)}</span>
                      </p>
                      <p className="text-xs text-steel-500">{formatDate(entry.at)}</p>
                      {entry.note && <p className="mt-1 text-[0.8125rem] text-steel-400">{entry.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-steel-500">No moves recorded.</p>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="Next step">
            {open ? (
              <>
                <p className="text-sm text-steel-100">{enquiry.nextAction || 'No next action set'}</p>
                {due && <p className={`mt-1 text-xs font-semibold ${TONE_TEXT[due.tone]}`}>{due.text}</p>}
                {enquiry.nextFollowUpDate && (
                  <p className="mt-0.5 text-xs text-steel-500">{formatDate(enquiry.nextFollowUpDate)}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-steel-500">This enquiry is closed.</p>
            )}
          </Section>

          <Section title="Who and where from">
            <Facts
              columns={1}
              items={[
                { label: 'Owner', value: enquiry.assignedTo?.name },
                { label: 'Source', value: optionLabel(SOURCES, enquiry.source) },
                { label: 'Probability', value: enquiry.probability != null && `${enquiry.probability}%` },
                {
                  label: 'From lead',
                  value: enquiry.lead && (
                    <Link to={`/leads/${enquiry.lead._id}`} className="text-accent hover:underline">
                      {enquiry.lead.number} · {enquiry.lead.company}
                    </Link>
                  ),
                },
                {
                  label: 'Raised with',
                  value: enquiry.groupRef && `${enquiry.groupRef} — other models from the same conversation`,
                },
              ]}
            />
          </Section>
        </div>
      </div>

      <Modal
        open={movingStage}
        title="Move stage"
        description="Every move is recorded, and the departments that pick up the work are notified"
        onClose={() => setMovingStage(false)}
      >
        <StageForm enquiry={enquiry} onClose={() => setMovingStage(false)} onSaved={setData} />
      </Modal>

      <Modal
        open={promoting}
        title="Add to the product catalogue"
        description="Turns this new development into a model marketing can quote against"
        size="lg"
        onClose={() => setPromoting(false)}
      >
        <PromoteForm enquiry={enquiry} onClose={() => setPromoting(false)} onSaved={reload} />
      </Modal>
    </div>
  );
}
