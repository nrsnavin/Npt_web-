import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  enquiries as enquiriesApi, quotations as quotationsApi,
  samples as samplesApi,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, FormError, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import Documents from '../components/Documents.jsx';
import EnquiryActivities from '../components/EnquiryActivities.jsx';
import EnquiryContactPanel from '../components/EnquiryContactPanel.jsx';
import DelegateEnquiry from '../components/DelegateEnquiry.jsx';
import DepartmentDesk from '../components/DepartmentDesk.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import QuotationPdf from '../components/QuotationPdf.jsx';
import ItemList from '../components/ItemList.jsx';
import EnquiryForm from '../components/EnquiryForm.jsx';
import { formatCurrency, formatDate, humanise } from '../utils/format.js';
import { GRAM_STEP } from '../utils/grams.js';
import {
  CLOSED_STAGES, HANGER_CATEGORIES, LOST_REASONS, MATERIALS,
  SAMPLE_PURPOSES, SOURCES, followUpState, inDays, nextStagesFrom, numeric,
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
function StageForm({ enquiry, initialStatus, onClose, onSaved }) {
  const options = nextStagesFrom(enquiry);
  const [status, setStatus] = useState(
    options.some((option) => option.value === initialStatus) ? initialStatus : options[0]?.value || ''
  );
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
          id: enquiry._id, expectedUpdatedAt: enquiry.updatedAt,
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
        <Field label="What is it waiting on" hint="Required — this is what somebody will look for later" required>
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
        <Field label="Confirmed value (₹)" hint="Required — this is the figure the month is counted in" required>
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
          <Field label="Next action" hint="Required while the enquiry is open" required>
            <input
              className="input"
              required
              placeholder="Call the buyer about the revised price"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
            />
          </Field>
          <Field label="Follow up on" required>
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

/**
 * A new development goes on the mould register once the tool is cut.
 *
 * This used to write a catalogue row — a code, a name, a tick saying a mould existed — which
 * could be done the afternoon the buyer said yes and long before anything was cut. The register
 * cannot be filled in on a promise: it asks for the part weight and the cycle time, and those
 * exist only once there is steel to measure. So a model becomes real at the moment it is real,
 * which is what a promotion gate is for.
 */
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
      material: enquiry.requirement?.material || 'pp',
      sizeMm: enquiry.requirement?.sizeMm || '',
      cavities: 1,
    },
  });

  const submit = async (values) => {
    setError(null);
    try {
      onSaved(
        await enquiriesApi.promoteToMould({
          id: enquiry._id,
          mouldCode: values.mouldCode,
          name: values.name,
          category: values.category,
          material: values.material,
          sizeMm: numeric(values.sizeMm),
          cavities: numeric(values.cavities),
          partWeightGrams: numeric(values.partWeightGrams),
          runnerWeightGrams: numeric(values.runnerWeightGrams),
          cycleTimeSeconds: numeric(values.cycleTimeSeconds),
          moq: numeric(values.moq),
          packingQty: numeric(values.packingQty),
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
        This keeps speculative models off the register: promote only once the buyer has approved
        what sampling produced and there is a tool to measure.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mould number" error={errors.mouldCode} hint="Stamped on the tool, e.g. M-142" required>
          <input className="input uppercase" {...register('mouldCode', { required: 'The mould number is required' })} />
        </Field>
        <Field label="Name" error={errors.name} required>
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
        <Field label="Cavities">
          <input type="number" min="1" className="input" {...register('cavities')} />
        </Field>
        {/*
          The two the register will not take a tool without. Every derived figure comes out of
          them — consumption per piece, output per hour, the machine cost of a piece — so a
          record created without them answers none of the questions the register exists for.
        */}
        <Field
          label="Part weight (g)"
          error={errors.partWeightGrams}
          hint="One moulded piece, on a PP basis"
        required>
          <input
            type="number"
            step={GRAM_STEP}
            className="input"
            {...register('partWeightGrams', { required: 'A moulded piece has a weight' })}
          />
        </Field>
        <Field label="Cycle (seconds)" error={errors.cycleTimeSeconds} hint="Door close to door close" required>
          <input
            type="number"
            step="0.1"
            className="input"
            {...register('cycleTimeSeconds', { required: 'A cycle takes time' })}
          />
        </Field>
        <Field label="Runner weight (g)" hint="The whole system per shot, not per cavity">
          <input type="number" step={GRAM_STEP} className="input" {...register('runnerWeightGrams')} />
        </Field>
        <Field label="Minimum order quantity">
          <input type="number" className="input" {...register('moq')} />
        </Field>
        <Field label="Packing quantity">
          <input type="number" className="input" {...register('packingQty')} />
        </Field>
      </div>

      <FormError error={error} />

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add to the register'}
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
function EnquiryCommercials({ enquiryId, canSeeQuotes }) {
  const [quotes, setQuotes] = useState(null);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!canSeeQuotes) {
      setQuotes([]);
      return undefined;
    }
    quotationsApi.list({ enquiry: enquiryId, limit: 20 })
      .then((response) => !cancelled && setQuotes(response.data || []))
      .catch(() => !cancelled && setQuotes([]));
    return () => {
      cancelled = true;
    };
  }, [enquiryId, canSeeQuotes]);

  if (!quotes) return null;

  const rupees = (value) =>
    value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;
  const rateOf = (row) => {
    const rates = (row.lines || []).map((line) => line.unitPrice).filter((price) => price != null);
    if (!rates.length) return 'not priced yet';
    const low = Math.min(...rates);
    const high = Math.max(...rates);
    return low === high ? rupees(low) : `${rupees(low)} – ${rupees(high)}`;
  };

  return (
    <>
      <Section title={`Quotations (${quotes.length})`}>
        {quotes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line/10 px-3.5 py-3">
            <p className="text-sm text-steel-300">Nothing priced yet.</p>
            <p className="mt-0.5 text-xs text-steel-500">
              <span className="font-semibold text-steel-400">Create Quotation</span> raises the
              quotation for the Quotation department to cost — it appears here once it does.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {quotes.map((row) => (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/[0.06] px-3.5 py-3"
              >
                <div className="min-w-0">
                  <Link to={`/quotations/${row._id}`} className="text-sm font-semibold text-steel-100 hover:text-accent">
                    {row.number}
                  </Link>
                  <p className="text-xs text-steel-400">
                    Rev {row.revision ?? 0} · {row.lines?.length === 1 ? row.lines[0].modelNumber : `${row.lines?.length ?? 0} models`} · {rateOf(row)}
                    {row.validUntil ? ` · valid to ${formatDate(row.validUntil)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setViewing(row)}>
                    PDF
                  </button>
                  <Badge status={row.status}>{humanise(row.status === 'draft' ? 'ready_to_send' : row.status)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <QuotationPdf quotation={viewing} open={Boolean(viewing)} onClose={() => setViewing(null)} />
    </>
  );
}

export default function EnquiryDetail() {
  const { id } = useParams();
  const { canRead, canWrite, user } = useAuth();
  const navigate = useNavigate();
  const [movingStage, setMovingStage] = useState(false);
  /* The stage picked in the side panel's status dropdown, pre-chosen in the move form. */
  const [stageChoice, setStageChoice] = useState(null);
  const [promoting, setPromoting] = useState(false);
  const [editing, setEditing] = useState(false);

  const fetch = useCallback((enquiryId) => enquiriesApi.get(enquiryId), []);
  const { data: enquiry, setData, loading, error, reload } = useRecord(fetch, id);

  /* Only the first load blanks the page; a reload after an action keeps it, and what is typed in it. */
  if (loading && !enquiry) return <Spinner label="Loading enquiry" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!enquiry) return null;

  const mayWrite = canWrite('enquiries');
  /* Marketing sees only its own enquiries, so whoever hands one on goes back to the list;
     Admin and the other departments still see it [server: ownership.service.js]. */
  const ownBookOnly = user?.role !== 'admin' && user?.department === 'marketing';
  const afterHandover = () => (ownBookOnly ? navigate('/enquiries') : reload());
  /*
   * A department working the enquiry without the enquiry module (Production, Quality, Dispatch,
   * Accounts) opens it from its task: it sees the enquiry and the department desk, not the
   * marketing panels that module gates [server: getEnquiry].
   */
  const mayReadEnquiries = canRead('enquiries');
  const mayWriteMoulds = canWrite('moulds');
  const mayReadSamples = canRead('samples');
  const mayReadPricing = canRead('pricing');
  const mayReadQuotes = canRead('pricing');
  const open = !CLOSED_STAGES.includes(enquiry.status);
  const due = followUpState(enquiry.nextFollowUpDate);
  /* An enquiry raised before items existed, read as the one item it is — see the Section. */
  const firstItem = {
    ...enquiry.requirement,
    mould: enquiry.mould,
    isNewDevelopment: enquiry.isNewDevelopment,
  };

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
            {/*
              Correcting what the buyer actually asked for.

              Everything downstream is built on it — the sample, the costing, the quotation — and
              it was taken down from a phone call. A wrong size or a misheard shade needs fixing
              in place; raising a second enquiry leaves two nobody can tell apart, and the sample
              already on the bench belongs to the first.
            */}
            {mayWrite && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit the enquiry
              </button>
            )}
            {/* At any stage: the owner or Admin hands it to another marketing person. */}
            {mayWrite && <DelegateEnquiry enquiry={enquiry} onDone={afterHandover} />}
            {mayWrite && enquiry.isNewDevelopment && mayWriteMoulds && (
              <button type="button" className="btn-secondary" onClick={() => setPromoting(true)}>
                Add to the register
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

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {/*
            * First, because it is what somebody came here to do. Reading the requirement is
            * what they do on the way to deciding which of these to press.
            */}
          {/* The plant's own screen: the twelve stages, and the buttons that send work to a
              department. The sales actions below still move the quote along. */}
          <DepartmentDesk enquiry={enquiry} onChanged={reload} />


          {/* Marketing's call log: what the buyer said, newest first, and the next step it set. */}
          {mayReadEnquiries && <EnquiryActivities enquiry={enquiry} canWrite={mayWrite} onSaved={reload} />}

          <Section
            title={enquiry.items?.length > 1
              ? `What was asked about (${enquiry.items.length})`
              : 'What was asked about'}
          >
            {/*
              Every model as a peer. The first one used to be printed here as a block of
              labelled facts with the rest listed underneath as run-together text, which said
              on its face that models two and three were afterthoughts — and left out the one
              field that changes what the bench may do, the colour rule.

              An enquiry written before the list existed answers `items: []` and carries its
              model on the flat fields, so it is shown as the one item it is. The backfill fills
              the database; a screen that depends on a script having been run is a screen that
              is blank for whoever runs it second.
            */}
            <ItemList items={enquiry.items?.length ? enquiry.items : [firstItem]} />

            {/* What belongs to the enquiry rather than to any one model. A buyer names one
                delivery date for the call, not one per hanger. */}
            <div className="mt-5 border-t border-line/[0.06] pt-4">
              <Facts
                items={[
                  { label: 'Target price', value: enquiry.targetPrice && formatCurrency(enquiry.targetPrice) },
                  { label: 'Required by', value: enquiry.requiredDeliveryDate && formatDate(enquiry.requiredDeliveryDate) },
                  { label: 'Estimated value', value: enquiry.estimatedValue && formatCurrency(enquiry.estimatedValue) },
                  { label: 'Remarks', value: enquiry.remarks, wide: true },
                ]}
              />
            </div>
          </Section>

          {mayReadSamples && <EnquirySamples enquiryId={enquiry._id} />}

          {/* What this enquiry has been priced and quoted at — the commercial half of its story. */}
          {(mayReadPricing || mayReadQuotes) && (
            <EnquiryCommercials
              enquiryId={enquiry._id}
              canSeeQuotes={mayReadQuotes}
            />
          )}

          {/* §27: the print artwork and the buyer's drawing sit with the enquiry that asked
              for them, rather than in the thread they arrived on. */}
          {mayReadEnquiries && <Documents collection="enquiries" id={enquiry._id} canWrite={mayWrite} />}

          {/* The stage history above says how it moved; this says who changed the quantity,
              the target price or the date the buyer is holding us to. */}
          {mayReadEnquiries && <HistoryPanel model="Enquiry" id={enquiry._id} refreshKey={enquiry.updatedAt} />}
        </div>

        <div className="space-y-5">
          {/* Where it stands with marketing, the buyer on the company WhatsApp and mail, and
              everything that happened — the timeline folds away. */}
          <EnquiryContactPanel
            enquiry={enquiry}
            isOwner={String(enquiry.assignedTo?._id || '') === String(user?.id || user?._id || '')}
            canWrite={mayWrite}
            stageOptions={nextStagesFrom(enquiry)}
            onPickStage={(status) => {
              setStageChoice(status);
              setMovingStage(true);
            }}
            onSent={reload}
            refreshKey={enquiry.updatedAt}
          />

          <Section title="Next step">
            {open ? (
              <>
                {enquiry.nextAction ? (
                  <p className="text-sm text-steel-100">{enquiry.nextAction}</p>
                ) : (
                  /*
                    A real state now that capture no longer demands one, so it reads as
                    something to do rather than as a field somebody forgot. It is also counted
                    as an exception on the marketing dashboard, which is where it gets chased.
                  */
                  <p className="text-sm text-warn-400">
                    Nothing set yet &mdash; the next stage move will set one, or say now what
                    happens next.
                  </p>
                )}
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
                {
                  label: 'Handed over',
                  value: enquiry.handovers?.length ? (
                    <ul className="space-y-1">
                      {enquiry.handovers.map((row) => (
                        <li key={`${row.at}-${row.to?._id}`}>
                          {formatDate(row.at)}: {row.from?.name || '—'} → {row.to?.name || '—'}
                          {row.by && row.by._id !== row.from?._id && ` (by ${row.by.name})`}
                          {row.note && <span className="text-steel-400"> — {row.note}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : undefined,
                },
                { label: 'Source', value: optionLabel(SOURCES, enquiry.source) },
                { label: 'Probability', value: enquiry.probability != null && `${enquiry.probability}%` },
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
        onClose={() => {
          setMovingStage(false);
          setStageChoice(null);
        }}
      >
        <StageForm
          key={stageChoice || 'stage'}
          enquiry={enquiry}
          initialStatus={stageChoice}
          onClose={() => {
            setMovingStage(false);
            setStageChoice(null);
          }}
          onSaved={setData}
        />
      </Modal>

      <Modal
        open={editing}
        title={`Edit ${enquiry.number}`}
        description="The same form that raised it, so there is one place a field can be wrong"
        onClose={() => setEditing(false)}
        size="lg"
      >
        <EnquiryForm enquiry={enquiry} onClose={() => setEditing(false)} onSaved={reload} />
      </Modal>

      <Modal
        open={promoting}
        title="Add to the mould register"
        description="Turns this new development into a model marketing can quote against"
        size="lg"
        onClose={() => setPromoting(false)}
      >
        <PromoteForm enquiry={enquiry} onClose={() => setPromoting(false)} onSaved={reload} />
      </Modal>
    </div>
  );
}
