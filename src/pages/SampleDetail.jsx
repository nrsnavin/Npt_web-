import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { samples as samplesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import {
  CLOSED_SAMPLE_STAGES, HANGER_CATEGORIES, MATERIALS, SAMPLE_PURPOSES, SAMPLE_STAGES,
  WITH_CUSTOMER_STAGES, followUpState, nextSampleStagesFrom, numeric, optionLabel,
  sampleStageLabel, text,
} from '../utils/pipeline.js';

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/**
 * The sample team moving its own work along.
 *
 * Dispatch is the one stage that asks for more than a note: courier, AWB and quantity are
 * mandatory [§6], because a sample the customer cannot be told how to expect is a sample
 * nobody chases. The server enforces the same thing.
 */
function StageForm({ sample, onClose, onSaved }) {
  const options = nextSampleStagesFrom(sample.status);
  const [status, setStatus] = useState(options[0]?.value || '');
  const [note, setNote] = useState('');
  const [courier, setCourier] = useState(sample.courier || '');
  const [awbNumber, setAwbNumber] = useState(sample.awbNumber || '');
  const [dispatchedQuantity, setDispatchedQuantity] = useState(sample.quantity ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const dispatching = status === 'dispatched';

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await samplesApi.setStatus({
          id: sample._id,
          status,
          note: text(note),
          courier: dispatching ? courier : undefined,
          awbNumber: dispatching ? awbNumber : undefined,
          dispatchedQuantity: dispatching ? numeric(dispatchedQuantity) : undefined,
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

      {dispatching && (
        <div className="rounded-lg border border-line/[0.06] p-4">
          <p className="mb-3 text-sm text-steel-400">
            The customer needs to know how it is coming, so these are not optional.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Courier">
              <input className="input" value={courier} onChange={(event) => setCourier(event.target.value)} />
            </Field>
            <Field label="AWB number">
              <input className="input" value={awbNumber} onChange={(event) => setAwbNumber(event.target.value)} />
            </Field>
            <Field label="Quantity sent">
              <input
                type="number"
                className="input"
                value={dispatchedQuantity}
                onChange={(event) => setDispatchedQuantity(event.target.value)}
              />
            </Field>
          </div>
        </div>
      )}

      <Field label="Note" hint="Recorded against this move in the history">
        <textarea rows={2} className="input" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {dispatching && (
        <Notice tone="info">
          Dispatching also moves the enquiry to sample feedback pending, and asks marketing to
          chase the answer.
        </Notice>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !status}>
          {busy ? 'Saving…' : `Move to ${sampleStageLabel(status)}`}
        </button>
      </div>
    </form>
  );
}

/** Marketing recording what the customer actually said. */
function FeedbackForm({ sample, onClose, onSaved }) {
  const [outcome, setOutcome] = useState('approved');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const outcomes = [
    { value: 'approved', label: 'Approved', hint: 'Sends the enquiry on to pricing.' },
    { value: 'modification_required', label: 'Modification required', hint: 'Ask the bench for another attempt.' },
    { value: 'rejected', label: 'Rejected', hint: 'The enquiry stays open — whether to close it is your call.' },
  ];

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await samplesApi.recordFeedback({ id: sample._id, outcome, note: text(note) }));
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div role="radiogroup" aria-label="What the customer said" className="space-y-2">
        {outcomes.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
              outcome === option.value
                ? 'border-flame-500/40 bg-flame-500/[0.06]'
                : 'border-line/[0.06] hover:border-line/15'
            }`}
          >
            <input
              type="radio"
              name="outcome"
              className="mt-0.5 h-4 w-4 accent-flame-500"
              checked={outcome === option.value}
              onChange={() => setOutcome(option.value)}
            />
            <span>
              <span className="block text-sm font-semibold text-steel-100">{option.label}</span>
              <span className="mt-0.5 block text-xs text-steel-500">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <Field label="What they said" hint="Their own words carry into the next attempt">
        <textarea rows={3} className="input" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Record feedback'}
        </button>
      </div>
    </form>
  );
}

export default function SampleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const [movingStage, setMovingStage] = useState(false);
  const [givingFeedback, setGivingFeedback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetch = useCallback((sampleId) => samplesApi.get(sampleId), []);
  const { data: sample, setData, loading, error, reload } = useRecord(fetch, id);

  if (loading) return <Spinner label="Loading sample" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!sample) return null;

  const maySample = canWrite('samples');
  const mayGiveFeedback = canWrite('enquiries');
  const closed = CLOSED_SAMPLE_STAGES.includes(sample.status);
  const withCustomer = WITH_CUSTOMER_STAGES.includes(sample.status);
  const due = followUpState(sample.requiredDate);
  const stageIndex = SAMPLE_STAGES.findIndex((stage) => stage.value === sample.status);

  const act = async (run) => {
    setBusy(true);
    setActionError(null);
    try {
      await run();
    } catch (runError) {
      setActionError(runError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={sample.number}
        subtitle={
          <>
            <Link to={`/customers/${sample.customer?._id}`} className="hover:text-accent">
              {sample.customer?.name}
            </Link>
            {' · '}
            <Link to={`/enquiries/${sample.enquiry?._id}`} className="hover:text-accent">
              {sample.enquiry?.number}
            </Link>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {sample.isOverdue && <Badge tone="danger">Overdue</Badge>}
            <Badge status={sample.status}>{sampleStageLabel(sample.status)}</Badge>

            {maySample && !closed && (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() =>
                  act(async () =>
                    setData(
                      await samplesApi.assign({
                        // Explicitly null hands it back; omitted takes it yourself.
                        id: sample._id,
                        ...(sample.assignedTo ? { assignedTo: null } : {}),
                      })
                    )
                  )
                }
              >
                {sample.assignedTo ? 'Hand back to the queue' : 'Pick this up'}
              </button>
            )}

            {maySample && sample.status === 'modification_required' && !sample.supersededBy && (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const result = await samplesApi.resample({ id: sample._id });
                    navigate(`/samples/${result.sample._id}`);
                  })
                }
              >
                Raise the next attempt
              </button>
            )}

            {mayGiveFeedback && withCustomer && (
              <button type="button" className="btn-primary" onClick={() => setGivingFeedback(true)}>
                Record feedback
              </button>
            )}

            {maySample && !closed && (
              <button
                type="button"
                className={withCustomer ? 'btn-secondary' : 'btn-primary'}
                onClick={() => setMovingStage(true)}
              >
                Move stage
              </button>
            )}
          </div>
        }
      />

      {actionError && (
        <div className="mb-5">
          <Notice tone="danger">{actionError}</Notice>
        </div>
      )}

      {sample.status === 'modification_required' && (
        <div className="mb-5">
          <Notice tone="warn">
            The customer asked for a change{sample.feedbackNote ? ` — ${sample.feedbackNote}` : '.'}
            {sample.supersededBy && (
              <>
                {' '}The next attempt is{' '}
                <Link to={`/samples/${sample.supersededBy._id}`} className="font-semibold underline">
                  {sample.supersededBy.number}
                </Link>
                .
              </>
            )}
          </Notice>
        </div>
      )}

      {sample.status === 'rejected' && (
        <div className="mb-5">
          <Notice tone="danger">
            Rejected{sample.feedbackNote ? ` — ${sample.feedbackNote}` : '.'} The enquiry is
            still open: re-sample it, or close it from the enquiry.
          </Notice>
        </div>
      )}

      {sample.status === 'cancelled' && (
        <div className="mb-5">
          <Notice tone="warn">
            Cancelled — the enquiry behind this request was lost, so it is off the bench.
          </Notice>
        </div>
      )}

      {sample.status === 'approved' && (
        <div className="mb-5">
          <Notice tone="success">
            Approved{sample.feedbackNote ? ` — ${sample.feedbackNote}` : '.'} The enquiry has
            moved on to pricing.
          </Notice>
        </div>
      )}

      {/* Position on the bench. Feedback outcomes sit outside the run, so only the nine
          working stages are drawn. */}
      <div className="mb-5 flex gap-1" aria-hidden="true">
        {SAMPLE_STAGES.slice(0, 9).map((stage, index) => (
          <span
            key={stage.value}
            title={stage.label}
            className={`h-1 flex-1 rounded-full ${
              index <= stageIndex && stageIndex < 9 ? 'bg-flame-500' : 'bg-line/[0.08]'
            }`}
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="What to make">
            <Facts
              items={[
                { label: 'Purpose', value: optionLabel(SAMPLE_PURPOSES, sample.purpose) },
                {
                  label: 'Model',
                  value: sample.product
                    ? `${sample.product.modelCode} — ${sample.product.name}`
                    : sample.modelNumber,
                },
                { label: 'Category', value: optionLabel(HANGER_CATEGORIES, sample.category) },
                { label: 'Material', value: optionLabel(MATERIALS, sample.material) },
                { label: 'Size', value: sample.sizeMm && `${sample.sizeMm} mm` },
                { label: 'Colour', value: sample.colour },
                { label: 'Quantity', value: `${formatNumber(sample.quantity)} pc` },
                { label: 'Printing', value: sample.printing },
                { label: 'Remarks', value: sample.remarks, wide: true },
              ]}
            />
          </Section>

          {(sample.courier || sample.dispatchedAt) && (
            <Section title="Dispatch">
              <Facts
                items={[
                  { label: 'Courier', value: sample.courier },
                  { label: 'AWB number', value: sample.awbNumber },
                  { label: 'Sent on', value: sample.dispatchedAt && formatDate(sample.dispatchedAt) },
                  { label: 'Quantity sent', value: sample.dispatchedQuantity && formatNumber(sample.dispatchedQuantity) },
                  { label: 'Delivered on', value: sample.deliveredAt && formatDate(sample.deliveredAt) },
                ]}
              />
            </Section>
          )}

          <Section title={`Stage history (${sample.statusHistory?.length || 0})`}>
            {sample.statusHistory?.length ? (
              <ol className="space-y-3">
                {[...sample.statusHistory].reverse().map((entry, index) => (
                  <li key={`${entry.to}-${entry.at}-${index}`} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-flame-500" />
                    <div className="min-w-0">
                      <p className="text-sm text-steel-100">
                        {entry.from ? `${sampleStageLabel(entry.from)} → ` : 'Raised as '}
                        <span className="font-semibold">{sampleStageLabel(entry.to)}</span>
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
          <Section title="Due">
            {closed ? (
              <p className="text-sm text-steel-500">This request is settled.</p>
            ) : (
              <>
                <p className="text-sm text-steel-100">{formatDate(sample.requiredDate)}</p>
                {due && (
                  <p className={`mt-1 text-xs font-semibold ${TONE_TEXT[sample.isOverdue ? 'danger' : due.tone]}`}>
                    {sample.isOverdue ? due.text : withCustomer ? 'With the customer' : due.text}
                  </p>
                )}
              </>
            )}
          </Section>

          <Section title="Who">
            <Facts
              columns={1}
              items={[
                { label: 'Requested by', value: sample.requestedBy?.name },
                { label: 'On the bench', value: sample.assignedTo?.name || 'Unassigned' },
                { label: 'Raised', value: formatDate(sample.requestedAt) },
                {
                  label: 'How',
                  value: sample.autoCreated ? 'Automatically, from the enquiry' : 'Raised by hand',
                },
                {
                  label: 'Previous attempt',
                  value: sample.previousSample && (
                    <Link to={`/samples/${sample.previousSample._id}`} className="text-accent hover:underline">
                      {sample.previousSample.number}
                    </Link>
                  ),
                },
              ]}
            />
          </Section>
        </div>
      </div>

      <Modal
        open={movingStage}
        title="Move stage"
        description="Where the sample has got to on the bench"
        onClose={() => setMovingStage(false)}
      >
        <StageForm sample={sample} onClose={() => setMovingStage(false)} onSaved={setData} />
      </Modal>

      <Modal
        open={givingFeedback}
        title="Record customer feedback"
        description="Only the person who spoke to them can answer this"
        onClose={() => setGivingFeedback(false)}
      >
        <FeedbackForm sample={sample} onClose={() => setGivingFeedback(false)} onSaved={setData} />
      </Modal>
    </div>
  );
}
