import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  enquiries as enquiriesApi, pricings as pricingsApi, quotations as quotationsApi,
  samples as samplesApi,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import Documents from '../components/Documents.jsx';
import EnquiryActions from '../components/EnquiryActions.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import { formatCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';
import {
  CLOSED_STAGES, ENQUIRY_STAGES, HANGER_CATEGORIES, LOST_REASONS, MATERIALS,
  SAMPLE_PURPOSES, SOURCES, WORKING_STAGE_COUNT, followUpState, inDays, nextStagesFrom, numeric,
  optionLabel, sampleStageLabel, stageLabel, text,
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
  const options = nextStagesFrom(enquiry);
  const [status, setStatus] = useState(options[0]?.value || '');
  const [note, setNote] = useState('');
  const [lostReason, setLostReason] = useState('price');
  const [holdReason, setHoldReason] = useState('');
  const [value, setValue] = useState(enquiry.estimatedValue ?? '');
  const [nextAction, setNextAction] = useState(enquiry.nextAction || '');
  /*
   * Defaulted rather than left blank, and never to a date already gone.
   *
   * Closing an enquiry clears its follow-up, so reopening one started with both fields empty
   * and the first submit was always refused by the server — "an open enquiry needs a next
   * action and a follow-up date" — which reads like a fault rather than a form that had not
   * been filled in. The same holds for an enquiry whose date has slipped into the past: it is
   * offered a fresh one instead of one that lands overdue the moment it is saved.
   */
  const [nextFollowUpDate, setNextFollowUpDate] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = enquiry.nextFollowUpDate ? enquiry.nextFollowUpDate.slice(0, 10) : null;
    return existing && existing >= today ? existing : inDays(3);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const closing = CLOSED_STAGES.includes(status);
  // Reopening: the enquiry is already closed and is being moved back into play.
  const reopening = CLOSED_STAGES.includes(enquiry.status);

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
          estimatedValue: status === 'won' && value !== '' ? Number(value) : undefined,
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
          {options.map((stage) => (
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

      {/* Required, for the same reason losing one is: an enquiry parked with no reason is
          invisible — nobody can tell what would have to change for it to move again. */}
      {status === 'hold' && (
        <Field label="What is it waiting on" hint="Required — this is what somebody will look for later">
          <input
            className="input"
            required
            placeholder="Buyer waiting on their own customer's approval"
            value={holdReason}
            onChange={(event) => setHoldReason(event.target.value)}
          />
        </Field>
      )}

      {/* Asked at the moment it is known. Won with this empty, the enquiry drops out of the
          confirmed-order figure the weekly review exists for, and nothing says it did. */}
      {status === 'won' && (
        <Field label="Confirmed value (₹)" hint="Required — this is the figure the month is counted in">
          <input
            type="number"
            className="input"
            required
            min="0"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
      )}

      {/* Required here because the server requires them: an open enquiry may not sit without
          a defined next step [§3], and finding that out from a red banner after pressing save
          is the worst place to learn it. */}
      {!closing && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next action" hint="Required while the enquiry is open">
            <input
              className="input"
              required
              placeholder="Call the buyer about the revised price"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
            />
          </Field>
          <Field label="Follow up on">
            <input
              type="date"
              className="input"
              required
              min={new Date().toISOString().slice(0, 10)}
              value={nextFollowUpDate}
              onChange={(event) => setNextFollowUpDate(event.target.value)}
            />
          </Field>
        </div>
      )}

      <Field
        label={reopening ? 'Why is it being reopened' : 'Note'}
        hint={reopening ? 'Required — it goes into the history' : 'Recorded against this move in the history'}
      >
        <textarea
          rows={2}
          className="input"
          required={reopening}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      {closing && !reopening && (
        <Notice tone="warn">
          Closing clears the follow-up. It can be reopened later, but only with a note saying why.
        </Notice>
      )}

      {reopening && (
        <Notice tone="info">
          This {enquiry.status} enquiry is being reopened. Say why in the note — it goes into the
          history beside the close it undoes, and the reason it was {enquiry.status} is cleared.
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

/**
 * The samples raised against this enquiry, so an enquiry reads as one record rather than
 * sending marketing to another screen to find out where its sample got to [§2].
 */
function EnquirySamples({ enquiryId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    samplesApi
      .list({ enquiry: enquiryId, limit: 20 })
      .then((response) => {
        if (!cancelled) setRows(response.data || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enquiryId]);

  if (!rows?.length) return null;

  return (
    <Section title={`Samples (${rows.length})`}>
      <ul className="space-y-2">
        {rows.map((sample) => (
          <li
            key={sample._id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/[0.06] px-3.5 py-3"
          >
            <div className="min-w-0">
              <Link to={`/samples/${sample._id}`} className="text-sm font-semibold text-steel-100 hover:text-accent">
                {sample.number}
              </Link>
              <p className="text-xs text-steel-400">
                {optionLabel(SAMPLE_PURPOSES, sample.purpose)}
                {sample.colour && ` · ${sample.colour}`}
                {sample.requiredDate && ` · due ${formatDate(sample.requiredDate)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {sample.isOverdue && <Badge tone="danger">Overdue</Badge>}
              <Badge status={sample.status}>{sampleStageLabel(sample.status)}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}


/**
 * What this enquiry has been priced and quoted at [§7, §10].
 *
 * The commercial half of an enquiry's story, on the enquiry. Without it the trail stops at the
 * stage badge: an enquiry sitting at "Quote submitted" says a quote exists and gives no way to
 * see it, so whoever wants the number goes to the quotations list and searches by customer —
 * which is exactly the work having the relation is supposed to remove.
 *
 * Fetched here rather than carried on the enquiry record, because the detail screen replaces
 * that record wholesale after every action. "Ask for a price" is the action that creates a
 * costing, and a list hanging off the record would blank itself at the moment it filled up.
 *
 * The costings arrive already redacted [§8] — marketing sees the price, never the cost base —
 * so nothing here has to remember to hide anything.
 */
function EnquiryCommercials({ enquiryId, canSeePricing, canSeeQuotes }) {
  const [pricings, setPricings] = useState(null);
  const [quotes, setQuotes] = useState(null);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = (allowed, call, set) => {
      if (!allowed) return set([]);
      return call
        .then((response) => !cancelled && set(response.data || []))
        .catch(() => !cancelled && set([]));
    };

    load(canSeePricing, pricingsApi.list({ enquiry: enquiryId, limit: 20 }), setPricings);
    load(canSeeQuotes, quotationsApi.list({ enquiry: enquiryId, limit: 20 }), setQuotes);

    return () => {
      cancelled = true;
    };
  }, [enquiryId, canSeePricing, canSeeQuotes]);

  const nothingYet = pricings?.length === 0 && quotes?.length === 0;
  if (!pricings || !quotes || nothingYet) return null;

  const rupees = (value) =>
    value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

  return (
    <>
      <Section title={`Pricing and quotations (${pricings.length + quotes.length})`}>
        {pricings.length > 0 && (
          <>
            <p className="eyebrow mb-2">Costings</p>
            <ul className="mb-4 space-y-2">
              {pricings.map((row) => (
                <li
                  key={row._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/[0.06] px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/pricings/${row._id}`}
                      className="text-sm font-semibold text-steel-100 hover:text-accent"
                    >
                      {row.number}
                    </Link>
                    <p className="text-xs text-steel-400">
                      {formatNumber(row.quantity)} pcs
                      {row.approvedSellingPrice ? ` · ${rupees(row.approvedSellingPrice)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/*
                      No separate "needs approval" flag here: unlike the costings list, this
                      shows the status itself, and `Approval pending` beside `Needs approval`
                      is the same sentence twice.
                    */}
                    <Badge status={row.status}>{humanise(row.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {quotes.length > 0 && (
          <>
            <p className="eyebrow mb-2">Quotations</p>
            <ul className="space-y-2">
              {quotes.map((row) => (
                <li
                  key={row._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/[0.06] px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/quotations/${row._id}`}
                      className="text-sm font-semibold text-steel-100 hover:text-accent"
                    >
                      {row.number}
                    </Link>
                    <p className="text-xs text-steel-400">
                      {/* One price where there is one, a count where there are several. */}
                      Rev {row.revision ?? 0} ·{' '}
                      {row.lines?.length === 1
                        ? `${formatNumber(row.lines[0].quantity)} pcs · ${rupees(row.lines[0].unitPrice)}${
                            row.lines[0].moq ? ` · MOQ ${formatNumber(row.lines[0].moq)}` : ''
                          }`
                        : `${row.lines?.length ?? 0} models · ${formatCurrency(
                            (row.lines || []).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
                          )}`}
                      {row.validUntil ? ` · valid to ${formatDate(row.validUntil)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* The document, from the record it belongs to. */}
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1 text-xs"
                      onClick={() => setViewing(row)}
                    >
                      PDF
                    </button>
                    <Badge status={row.status}>{humanise(row.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <QuotationPdf
        quotation={viewing}
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
      />
    </>
  );
}

export default function EnquiryDetail() {
  const { id } = useParams();
  const { canRead, canWrite } = useAuth();
  const [movingStage, setMovingStage] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const fetch = useCallback((enquiryId) => enquiriesApi.get(enquiryId), []);
  const { data: enquiry, setData, loading, error, reload } = useRecord(fetch, id);

  if (loading) return <Spinner label="Loading enquiry" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!enquiry) return null;

  const mayWrite = canWrite('enquiries');
  const mayWriteProducts = canWrite('products');
  const mayReadSamples = canRead('samples');
  const mayReadPricing = canRead('pricing');
  const mayReadQuotes = canRead('quotations');
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
            {/* A closed enquiry keeps the control, renamed for what it now does: the buyer
                who comes back is a reopen, not a fresh record with no history behind it. */}
            {/*
              * Kept, and demoted. The named actions cover what happens on an ordinary day;
              * this is for the day that is not ordinary — and for reopening, which is the one
              * move a closed enquiry has.
              */}
            {mayWrite && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setMovingStage(true)}
              >
                {open ? 'Move stage by hand' : 'Reopen'}
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

      {/* The funnel position, so the stage reads as a place rather than a word. Won, lost
          and hold sit outside the run, so only the nine working stages are drawn. */}
      <div className="mb-5 flex gap-1" aria-hidden="true">
        {ENQUIRY_STAGES.slice(0, WORKING_STAGE_COUNT).map((stage, index) => (
          <span
            key={stage.value}
            title={stage.label}
            className={`h-1 flex-1 rounded-full ${
              index <= stageIndex && stageIndex < WORKING_STAGE_COUNT
                ? 'bg-flame-500'
                : 'bg-line/[0.08]'
            }`}
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/*
            * First, because it is what somebody came here to do. Reading the requirement is
            * what they do on the way to deciding which of these to press.
            */}
          <EnquiryActions enquiry={enquiry} onSaved={setData} canWrite={mayWrite} />

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

          {mayReadSamples && <EnquirySamples enquiryId={enquiry._id} />}

          {/* What this enquiry has been priced and quoted at — the commercial half of its story. */}
          {(mayReadPricing || mayReadQuotes) && (
            <EnquiryCommercials
              enquiryId={enquiry._id}
              canSeePricing={mayReadPricing}
              canSeeQuotes={mayReadQuotes}
            />
          )}

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

          {/* §27: the print artwork and the buyer's drawing sit with the enquiry that asked
              for them, rather than in the thread they arrived on. */}
          <Documents collection="enquiries" id={enquiry._id} canWrite={mayWrite} />

          {/* The stage history above says how it moved; this says who changed the quantity,
              the target price or the date the buyer is holding us to. */}
          <HistoryPanel model="Enquiry" id={enquiry._id} />
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
        title={CLOSED_STAGES.includes(enquiry.status) ? 'Reopen this enquiry' : 'Move stage'}
        description={
          CLOSED_STAGES.includes(enquiry.status)
            ? 'It comes back with its history intact — the note explains why to whoever reads it next'
            : 'Every move is recorded, and the departments that pick up the work are notified'
        }
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
