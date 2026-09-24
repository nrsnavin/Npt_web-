import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { samples as samplesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Field, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import AuthedImage from '../components/AuthedImage.jsx';
import { CustomerSelect, EnquirySelect } from '../components/pickers.jsx';
import SampleLog from '../components/SampleLog.jsx';
import SampleRequestForm from '../components/SampleRequestForm.jsx';
import ItemList from '../components/ItemList.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import {
  CLOSED_SAMPLE_STAGES, HANGER_CATEGORIES, MATERIALS, MESSAGE_CHANNELS, MESSAGE_EVENTS,
  BACKWARD_REASON_MIN, NOTIFIABLE_STAGES,
  SAMPLE_PURPOSES, SAMPLE_STAGE_HINTS, SAMPLE_STAGE_RANK, SKIP_REASONS,
  WITH_CUSTOMER_STAGES, followUpState, isBackwardSampleMove, numeric, optionLabel,
  sampleMovesFrom, sampleStageLabel, text,
} from '../utils/pipeline.js';

const TONE_TEXT = {
  danger: 'text-danger-400',
  warn: 'text-warn-400',
  info: 'text-aqua-300',
  neutral: 'text-steel-400',
};

/**
 * The one move that needs telling something first — dispatching, going back, or cancelling.
 *
 * Dispatch asks for the courier, AWB and quantity [§6], because a sample the customer cannot be
 * told how to expect is a sample nobody chases. A step back asks why, because it is the move
 * somebody will ask about later and the answer is otherwise only in the head of whoever clicked;
 * the server refuses both without them. Cancelling asks why too: it ends somebody's request.
 */
function StageForm({ sample, to, onClose, onSaved }) {
  const [note, setNote] = useState('');
  const [courier, setCourier] = useState(sample.courier || '');
  const [awbNumber, setAwbNumber] = useState(sample.awbNumber || '');
  const [dispatchedQuantity, setDispatchedQuantity] = useState(sample.quantity ?? '');
  /* Prefilled with the shade asked for, because "it went out as requested" is the ordinary
     case and a box somebody must retype to say the obvious gets whatever clears it. */
  const [dispatchedColour, setDispatchedColour] = useState(
    sample.dispatchedColour || sample.colour || ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const dispatching = to === 'dispatched';
  const goingBack = isBackwardSampleMove(sample.status, to);
  const cancelling = to === 'cancelled';
  const reasonNeeded = goingBack || cancelling;
  const reasonShort = reasonNeeded && note.trim().length < BACKWARD_REASON_MIN;
  const substituting =
    Boolean(sample.colour) &&
    Boolean(dispatchedColour.trim()) &&
    dispatchedColour.trim().toLowerCase() !== sample.colour.trim().toLowerCase();

  const submit = async (event) => {
    event.preventDefault();
    if (reasonShort) {
      setError(`Say why in a few words — at least ${BACKWARD_REASON_MIN} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await samplesApi.setStatus({
          id: sample._id, expectedUpdatedAt: sample.updatedAt,
          status: to,
          note: text(note),
          courier: dispatching ? courier : undefined,
          awbNumber: dispatching ? awbNumber : undefined,
          dispatchedQuantity: dispatching ? numeric(dispatchedQuantity) : undefined,
          dispatchedColour: dispatching ? text(dispatchedColour) : undefined,
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
      <div className="flex items-center gap-3 rounded-lg border border-line/[0.06] bg-line/[0.02] px-4 py-3 text-sm">
        <span className="text-steel-400">{sampleStageLabel(sample.status)}</span>
        <span aria-hidden="true" className={goingBack || cancelling ? 'text-warn-400' : 'text-accent'}>
          {goingBack ? '↩' : '→'}
        </span>
        <span className="font-semibold text-steel-50">{sampleStageLabel(to)}</span>
      </div>

      {goingBack && (
        <Notice tone="warn">
          This sends the sample back a stage. The reason goes into the stage history, so whoever
          looks later can see what went wrong.
        </Notice>
      )}

      {dispatching && (
        <div className="rounded-lg border border-line/[0.06] p-4">
          <p className="mb-3 text-sm text-steel-400">
            The customer needs to know how it is coming, so these are not optional.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Courier" required>
              <input className="input" required value={courier} onChange={(event) => setCourier(event.target.value)} />
            </Field>
            <Field label="Tracking number" hint="The courier's AWB" required>
              <input className="input" required value={awbNumber} onChange={(event) => setAwbNumber(event.target.value)} />
            </Field>
            <Field label="Quantity sent" required>
              <input
                type="number"
                min="1"
                required
                className="input"
                value={dispatchedQuantity}
                onChange={(event) => setDispatchedQuantity(event.target.value)}
              />
            </Field>

            {/*
              What actually went in the bag, which the register had no field for until now. The
              colour on the request is what was *asked for*; without this the two were the same
              box, so a substitution left no trace and a rejection three weeks later had no
              explanation in it.
            */}
            {sample.colour && (
              <Field
                label="Colour it was sent in"
                hint={sample.colourRule || undefined}
                className={sample.colourMandatory ? '' : 'sm:col-span-2'}
              >
                <input
                  className="input"
                  value={dispatchedColour}
                  onChange={(event) => setDispatchedColour(event.target.value)}
                />
              </Field>
            )}
          </div>

          {/*
            Said before the save, not after the refusal. The strict case is a wall the bench
            cannot climb — deliberately, since an override the maker grants themselves is the
            same as no rule — so the screen must not let somebody type an AWB, press the button
            and only then find out.
          */}
          {substituting && (
            <div className="mt-3">
              <Notice tone={sample.colourMandatory ? 'danger' : 'warn'}>
                {sample.colourMandatory ? (
                  <p>
                    <span className="font-bold">{sample.colour} exactly</span> was a condition of
                    this request, so it cannot go out in {dispatchedColour.trim()}. Send it in{' '}
                    {sample.colour}, or ask {sample.requestedBy?.name || 'whoever raised it'} to
                    drop the exact-colour condition first.
                  </p>
                ) : (
                  <p>
                    Going out in {dispatchedColour.trim()} rather than the {sample.colour} asked
                    for. That is allowed — the colour was a preference —{' '}
                    {sample.requestedBy?.name || 'whoever raised it'} gets a note to mention it
                    before the buyer opens the bag.
                  </p>
                )}
              </Notice>
            </div>
          )}
        </div>
      )}

      <Field
        label={goingBack ? 'Why is it going back?' : cancelling ? 'Why is it being cancelled?' : 'Note'}
        hint={
          reasonNeeded
            ? 'Required — recorded against this move in the stage history'
            : 'Optional — recorded against this move in the stage history'
        }
        required={reasonNeeded}
      >
        <textarea
          rows={3}
          className="input"
          value={note}
          maxLength={500}
          required={reasonNeeded}
          placeholder={goingBack ? 'Handle cracked in the drop test' : cancelling ? 'Buyer dropped the model' : ''}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      {dispatching && (
        <Notice tone="info">
          Dispatching also moves the enquiry to sample feedback pending, and asks marketing to
          chase the answer.
        </Notice>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        {/* Held shut while the strict colour rule is broken, or the reason is missing. The
            server refuses both anyway, but a button that submits only to come back with a
            refusal teaches people to press buttons and read afterwards. */}
        <button
          type="submit"
          className={cancelling ? 'btn-danger' : 'btn-primary'}
          disabled={busy || reasonShort || (dispatching && substituting && sample.colourMandatory)}
        >
          {busy
            ? 'Saving…'
            : cancelling
              ? 'Cancel the request'
              : goingBack
                ? `Send back to ${sampleStageLabel(to)}`
                : `Move to ${sampleStageLabel(to)}`}
        </button>
      </div>
    </form>
  );
}

/**
 * The run a sample makes, as steps: done, skipped, where it is, and what is still ahead.
 *
 * "Stock found" and "production required" are one step — the two answers to "is there stock?" —
 * named for whichever answer this sample got. Printing is optional, so a sample that never
 * needed it shows the step as skipped rather than pretending it happened.
 */
const RUN = [
  ['request_received'],
  ['checking_stock'],
  ['sample_available', 'production_required'],
  ['printing_required'],
  ['sample_ready'],
  ['dispatched'],
  ['delivered'],
  ['customer_feedback_pending'],
];

const OUTCOME_TONE = {
  approved: 'border-success-500/40 bg-success-500/10 text-success-400',
  rejected: 'border-danger-500/40 bg-danger-500/10 text-danger-400',
  cancelled: 'border-line/15 bg-line/[0.04] text-steel-300',
  modification_required: 'border-warn-500/40 bg-warn-500/10 text-warn-400',
};

function StageStepper({ sample }) {
  const visited = new Set(['request_received', ...(sample.statusHistory || []).map((entry) => entry.to)]);
  const onRun = sample.status in SAMPLE_STAGE_RANK;
  /* Off the run — answered, cancelled, or sent back for a change — the steps show how far it got. */
  const reached = onRun
    ? SAMPLE_STAGE_RANK[sample.status]
    : Math.max(...[...visited].map((status) => SAMPLE_STAGE_RANK[status] ?? -1));

  const steps = RUN.map((statuses, index) => {
    const current = onRun && statuses.includes(sample.status);
    const history = [...(sample.statusHistory || [])].reverse();
    const named = current
      ? sample.status
      : history.find((entry) => statuses.includes(entry.to))?.to || null;
    const label =
      statuses.length > 1 && !named ? 'Stock or production' : sampleStageLabel(named || statuses[0]);
    const state = current
      ? 'current'
      : index < reached || (index === reached && !onRun)
        ? statuses.some((status) => visited.has(status)) ? 'done' : 'skipped'
        : 'ahead';
    return { key: statuses[0], label, state, number: index + 1 };
  });

  return (
    /* Four to a row on a phone, so the run reads as two even lines rather than a ragged wrap;
       one line from a tablet up. Connectors that would dangle off a row's edge are hidden. */
    <ol className="grid grid-cols-4 items-start gap-y-4 sm:flex" aria-label="Sample stages">
      {steps.map((step, index) => (
        <li
          key={step.key}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="flex min-w-0 flex-1 flex-col items-center text-center"
        >
          <div className="flex w-full items-center">
            <span
              className={`h-0.5 flex-1 ${index === 0 ? 'opacity-0' : step.state === 'ahead' ? 'bg-line/10' : 'bg-flame-500/60'} ${
                index % 4 === 0 ? 'max-sm:opacity-0' : ''
              }`}
            />
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                step.state === 'current'
                  ? 'bg-flame-500 text-white ring-4 ring-flame-500/25'
                  : step.state === 'done'
                    ? 'bg-flame-500/15 text-flame-400 ring-1 ring-inset ring-flame-500/40'
                    : step.state === 'skipped'
                      ? 'border border-dashed border-line/20 text-steel-500'
                      : 'bg-line/[0.05] text-steel-500 ring-1 ring-inset ring-line/10'
              }`}
            >
              {step.state === 'done' ? '✓' : step.state === 'skipped' ? '–' : step.number}
            </span>
            <span
              className={`h-0.5 flex-1 ${index === steps.length - 1 ? 'opacity-0' : steps[index + 1].state === 'ahead' ? 'bg-line/10' : 'bg-flame-500/60'} ${
                index % 4 === 3 ? 'max-sm:opacity-0' : ''
              }`}
            />
          </div>
          <span
            className={`mt-2 px-1 text-xs leading-tight ${
              step.state === 'current'
                ? 'font-bold text-steel-50'
                : step.state === 'ahead' || step.state === 'skipped'
                  ? 'text-steel-500'
                  : 'text-steel-300'
            }`}
          >
            {step.label}
            {step.state === 'skipped' && <span className="block text-[10px]">skipped</span>}
          </span>
        </li>
      ))}
      {!onRun && (
        <li className="col-span-4 flex flex-1 flex-col items-center justify-start pt-0.5">
          <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${OUTCOME_TONE[sample.status] || OUTCOME_TONE.cancelled}`}>
            {sampleStageLabel(sample.status)}
          </span>
        </li>
      )}
    </ol>
  );
}

/**
 * Moving a sample, as cards rather than a dropdown.
 *
 * Onward stages are big buttons with the nearest one leading — it is the move the bench makes
 * nine times in ten, one click, done. Dispatch opens the courier form. Stepping back is a row
 * of smaller amber buttons that each ask why first, and cancelling sits apart at the end: both
 * are allowed, neither should be the easy thing to hit by accident.
 */
function StagePanel({ sample, mayMove, onSaved, onAsk }) {
  const [busyTo, setBusyTo] = useState(null);
  const [error, setError] = useState(null);
  const { onward, recommended, back, cancel } = sampleMovesFrom(sample.status);
  const showMoves = mayMove && (onward.length > 0 || back.length > 0 || cancel);

  const go = async (to) => {
    if (to === 'dispatched') {
      onAsk(to);
      return;
    }
    setBusyTo(to);
    setError(null);
    try {
      onSaved(await samplesApi.setStatus({ id: sample._id, expectedUpdatedAt: sample.updatedAt, status: to }));
    } catch (moveError) {
      setError(moveError.message);
    } finally {
      setBusyTo(null);
    }
  };

  return (
    <section className="card mb-5 p-5">
      <StageStepper sample={sample} />

      {showMoves && (
        <div className="mt-6 border-t border-line/[0.06] pt-5">
          {onward.length > 0 && (
            <>
              <p className="eyebrow">Move this sample on</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {onward.map((stage) => {
                  const leading = stage.value === recommended;
                  return (
                    <button
                      key={stage.value}
                      type="button"
                      disabled={Boolean(busyTo)}
                      onClick={() => go(stage.value)}
                      className={`group flex items-center gap-3 rounded-xl border p-4 text-left transition-colors disabled:opacity-60 ${
                        leading
                          ? 'border-flame-500/50 bg-flame-500/[0.08] hover:bg-flame-500/[0.14]'
                          : 'border-line/10 bg-line/[0.02] hover:border-line/20 hover:bg-line/[0.05]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold ${
                          leading ? 'bg-flame-500 text-white' : 'bg-line/[0.06] text-steel-300'
                        }`}
                      >
                        →
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-steel-50">
                            {busyTo === stage.value ? 'Moving…' : sampleStageLabel(stage.value)}
                          </span>
                          {leading && (
                            <span className="rounded bg-flame-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-flame-400">
                              Next step
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-steel-400">
                          {SAMPLE_STAGE_HINTS[stage.value]}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {(back.length > 0 || cancel) && (
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              {back.length > 0 && (
                <div>
                  <p className="eyebrow">Send back · a reason is required</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {back.map((stage) => (
                      <button
                        key={stage.value}
                        type="button"
                        disabled={Boolean(busyTo)}
                        onClick={() => onAsk(stage.value)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-warn-500/30 bg-warn-500/[0.06] px-3 py-1.5 text-xs font-semibold text-warn-400 transition-colors hover:bg-warn-500/[0.12]"
                      >
                        <span aria-hidden="true">↩</span> {sampleStageLabel(stage.value)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {cancel && (
                <button
                  type="button"
                  disabled={Boolean(busyTo)}
                  onClick={() => onAsk('cancelled')}
                  className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-danger-400 transition-colors hover:bg-danger-500/10"
                >
                  Cancel this request
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Marketing recording what the customer actually said. */
function FeedbackForm({ sample, onClose, onSaved }) {
  const [outcome, setOutcome] = useState('approved');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // A trial with no customer has no customer verdict and no enquiry to move on.
  const internal = !sample.customer;

  const outcomes = internal
    ? [
        { value: 'approved', label: 'Approved', hint: 'The trial worked. Closes this request.' },
        { value: 'modification_required', label: 'Modification required', hint: 'Try again with a change.' },
        { value: 'rejected', label: 'Rejected', hint: 'The trial did not work. Closes this request.' },
      ]
    : [
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
      <div role="radiogroup" aria-label={internal ? 'How the trial went' : 'What the customer said'} className="space-y-2">
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

      <Field
        label={internal ? 'What happened' : 'What they said'}
        hint={internal ? 'Carries into the next attempt' : 'Their own words carry into the next attempt'}
      >
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




/**
 * The buyer's own reference — what they handed over or sent a picture of, as opposed to the
 * log, which is what the bench produced. One photo, replaced rather than accumulated: a
 * reference that is a gallery is not a reference.
 */
function ReferencePhoto({ sample, mayEdit, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(false);
  const input = useRef(null);

  const upload = async (event) => {
    const photo = event.target.files?.[0];
    if (!photo) return;

    setBusy(true);
    setError(null);
    try {
      onSaved(await samplesApi.setReferencePhoto({ id: sample._id, photo }));
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await samplesApi.clearReferencePhoto(sample._id));
    } catch (clearError) {
      setError(clearError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!sample.referencePhoto && !mayEdit) return null;

  return (
    <Section
      title="Buyer's reference"
      actions={
        mayEdit ? (
          <div className="flex items-center gap-3">
            <label className="row-action cursor-pointer">
              {busy ? 'Uploading…' : sample.referencePhoto ? 'Replace' : 'Add photo'}
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="sr-only"
                onChange={upload}
                disabled={busy}
              />
            </label>
            {sample.referencePhoto && (
              <button type="button" className="row-action-danger" onClick={clear} disabled={busy}>
                Remove
              </button>
            )}
          </div>
        ) : null
      }
    >
      {sample.referencePhoto ? (
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="block overflow-hidden rounded-lg border border-line/[0.06] transition-opacity hover:opacity-90"
          aria-label="Open the reference photo full size"
        >
          <AuthedImage
            attachmentKey={sample.referencePhoto.key}
            alt="Buyer's reference"
            className="h-44 w-full max-w-xs object-cover"
          />
        </button>
      ) : (
        <p className="text-sm text-steel-500">
          Nothing supplied. Add the piece or drawing the buyer sent, so the bench works from
          the same picture everyone else is looking at.
        </p>
      )}

      {sample.referenceImageUrl && (
        <p className="mt-2 text-xs text-steel-500">
          Link from the enquiry:{' '}
          <a href={sample.referenceImageUrl} className="text-accent hover:underline" target="_blank" rel="noreferrer">
            {sample.referenceImageUrl}
          </a>
        </p>
      )}

      {error && (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      <Modal open={viewing} title="Buyer's reference" size="lg" onClose={() => setViewing(false)}>
        {sample.referencePhoto && (
          <AuthedImage
            attachmentKey={sample.referencePhoto.key}
            alt="Buyer's reference"
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        )}
      </Modal>
    </Section>
  );
}

/**
 * Courier, tracking number, date and quantity.
 *
 * Reachable at any open stage, not only when dispatching: the courier is usually arranged
 * before the sample leaves, and entering it early means the customer is told how it is coming
 * in the ready message rather than being promised details later. It is also the only way to
 * fix a tracking number typed wrong, since a sample dispatches once.
 */
function DispatchDetailsForm({ sample, onClose, onSaved }) {
  const [courier, setCourier] = useState(sample.courier || '');
  const [awbNumber, setAwbNumber] = useState(sample.awbNumber || '');
  const [dispatchedQuantity, setDispatchedQuantity] = useState(
    sample.dispatchedQuantity ?? sample.quantity ?? ''
  );
  const [dispatchedAt, setDispatchedAt] = useState(
    sample.dispatchedAt ? sample.dispatchedAt.slice(0, 10) : ''
  );
  const [dispatchedColour, setDispatchedColour] = useState(sample.dispatchedColour || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const alreadyGone = WITH_CUSTOMER_STAGES.includes(sample.status);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await samplesApi.setDispatchDetails({
          id: sample._id,
          courier: text(courier) ?? null,
          awbNumber: text(awbNumber) ?? null,
          dispatchedQuantity: numeric(dispatchedQuantity) ?? null,
          dispatchedAt: text(dispatchedAt) ?? null,
          dispatchedColour: text(dispatchedColour) ?? null,
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Courier">
          <input
            className="input"
            placeholder="Blue Dart"
            value={courier}
            onChange={(event) => setCourier(event.target.value)}
          />
        </Field>
        <Field label="Tracking number" hint="What the courier gave you">
          <input
            className="input"
            value={awbNumber}
            onChange={(event) => setAwbNumber(event.target.value)}
          />
        </Field>
        <Field label="Quantity sent">
          <input
            type="number"
            className="input"
            value={dispatchedQuantity}
            onChange={(event) => setDispatchedQuantity(event.target.value)}
          />
        </Field>
        <Field label="Sent on" hint="Filled in automatically when you dispatch">
          <input
            type="date"
            className="input"
            value={dispatchedAt}
            onChange={(event) => setDispatchedAt(event.target.value)}
          />
        </Field>
        {sample.colour && (
          <Field
            label="Colour it was sent in"
            className="sm:col-span-2"
            hint={sample.colourRule || undefined}
          >
            <input
              className="input"
              placeholder={sample.colour}
              value={dispatchedColour}
              onChange={(event) => setDispatchedColour(event.target.value)}
            />
          </Field>
        )}
      </div>

      <Notice tone="info">
        {alreadyGone
          ? 'Correcting these does not message the customer on its own. Use “Tell the customer” to send them the correction.'
          : 'Entered before you dispatch, these go to the customer with the ready update, instead of promising to confirm later.'}
      </Notice>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save courier details'}
        </button>
      </div>
    </form>
  );
}

/**
 * Telling the customer by hand [§42].
 *
 * The two sample stages send themselves, so this is for the cases automation cannot cover:
 * re-sending after a provider failure, reaching a customer who was opted out at the time, or
 * saying it differently. The draft is the same one the automation would have sent, and
 * editing it is the point of the dialog.
 */
function CustomerMessageForm({ sample, event, onClose, onSent }) {
  const [preview, setPreview] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState(['whatsapp', 'email']);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    samplesApi
      .messagePreview({ id: sample._id, event })
      .then((draft) => {
        if (cancelled) return;
        setPreview(draft);
        setSubject(draft.subject);
        setBody(draft.body);
        // Offer only the channels this customer can actually be reached on.
        setChannels(
          draft.channels.filter((row) => row.address && row.enabled).map((row) => row.channel)
        );
      })
      .catch((loadError) => !cancelled && setError(loadError.message));
    return () => {
      cancelled = true;
    };
  }, [sample._id, event]);

  if (error && !preview) return <Notice tone="danger">{error}</Notice>;
  if (!preview) return <Spinner label="Building the draft" />;

  const toggle = (channel) =>
    setChannels((current) =>
      current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]
    );

  const submit = async (submitEvent) => {
    submitEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSent(
        await samplesApi.sendMessage({
          id: sample._id,
          event,
          channels,
          subject: text(subject),
          body: text(body),
          force,
        })
      );
      onClose();
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {preview.alreadySent.length > 0 && (
        <Notice tone="warn">
          Already sent {preview.alreadySent.length === 1 ? 'once' : `${preview.alreadySent.length} times`} —
          last on {formatDate(preview.alreadySent[0].sentAt)}
          {preview.alreadySent[0].sentBy ? ` by ${preview.alreadySent[0].sentBy.name}` : ' automatically'}.
          <label className="mt-2 flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-flame-500"
              checked={force}
              onChange={(changeEvent) => setForce(changeEvent.target.checked)}
            />
            Send it again anyway
          </label>
        </Notice>
      )}

      <div>
        <span className="label">Channels</span>
        <div className="space-y-2">
          {preview.channels.map((row) => {
            const unreachable = !row.address || !row.enabled;
            return (
              <label
                key={row.channel}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 ${
                  unreachable ? 'border-line/[0.06] opacity-60' : 'border-line/10'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-flame-500"
                    disabled={unreachable}
                    checked={channels.includes(row.channel)}
                    onChange={() => toggle(row.channel)}
                  />
                  <span className="text-sm font-semibold text-steel-100">
                    {optionLabel(MESSAGE_CHANNELS, row.channel)}
                  </span>
                </span>
                <span className="truncate text-xs text-steel-500">
                  {!row.address
                    ? 'No address on file'
                    : !row.enabled
                      ? 'Customer opted out'
                      : row.address}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <Field label="Subject" hint="Email only — WhatsApp sends the message on its own">
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>

      <Field label="Message" hint="Edit freely. Only what is here goes to the customer.">
        <textarea rows={9} className="input font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || channels.length === 0}>
          {busy ? 'Sending…' : `Send to ${preview.customer?.name || 'the customer'}`}
        </button>
      </div>
    </form>
  );
}

/** Everything ever sent to this customer about this sample [§42.6]. */
function CustomerMessages({ sampleId, refreshKey }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    samplesApi
      .messages(sampleId)
      .then((data) => !cancelled && setRows(data))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [sampleId, refreshKey]);

  if (!rows.length) return null;

  const tone = { sent: 'success', failed: 'danger', skipped: 'neutral' };

  return (
    <Section title={`Sent to the customer (${rows.filter((row) => row.status === 'sent').length})`}>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row._id} className="rounded-lg border border-line/[0.06] px-3.5 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-steel-100">
                  {optionLabel(MESSAGE_CHANNELS, row.channel)} · {optionLabel(MESSAGE_EVENTS, row.event)}
                </p>
                <p className="text-xs text-steel-500">
                  {formatDate(row.sentAt)}
                  {row.recipient ? ` · ${row.recipient}` : ''}
                  {' · '}
                  {row.automatic ? 'automatic' : row.sentBy?.name || 'by hand'}
                  {row.edited ? ' · edited' : ''}
                </p>
              </div>
              <Badge tone={tone[row.status]}>
                {row.status === 'skipped' ? optionLabel(SKIP_REASONS, row.skipReason) : row.status}
              </Badge>
            </div>
            {row.error && <p className="mt-1.5 text-xs text-danger-400">{row.error}</p>}
            {row.body && (
              <p className="mt-2 whitespace-pre-wrap border-l-2 border-line/10 pl-3 text-xs leading-relaxed text-steel-400">
                {row.body}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}


/** Attaching a request raised before its enquiry existed. */
/**
 * Names the buyer on a request raised for nobody.
 *
 * The counter job and the internal trial both start unattached, and some of them turn into
 * real work. Re-raising the request to get the buyer onto it would throw away the log, the
 * photographs and everything already made.
 */
function NameCustomerForm({ sample, onClose, onSaved }) {
  const [customer, setCustomer] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!customer) return;

    setBusy(true);
    setError(null);
    try {
      onSaved(await samplesApi.linkCustomer({ id: sample._id, customer }));
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Customer" hint="Not in the list yet? Add them here.">
        <CustomerSelect
          value={customer}
          onChange={setCustomer}
          emptyLabel=""
          aria-label="Customer"
        />
      </Field>

      <Notice tone="info">
        Once named it stays named. Moving a sample to a different customer would rewrite what
        was made for whom.
      </Notice>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !customer}>
          {busy ? 'Saving…' : 'Name the customer'}
        </button>
      </div>
    </form>
  );
}

function LinkEnquiryForm({ sample, onClose, onSaved }) {
  const [enquiry, setEnquiry] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!enquiry) return;

    setBusy(true);
    setError(null);
    try {
      onSaved(await samplesApi.linkEnquiry({ id: sample._id, enquiry }));
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="Enquiry"
        hint={
          sample.customer
            ? `Only ${sample.customer.name}'s open enquiries — a sample cannot move between customers`
            : 'Attaching it also gives the request that enquiry’s customer'
        }
      >
        <EnquirySelect
          value={enquiry}
          onChange={setEnquiry}
          customer={sample.customer?._id}
          aria-label="Enquiry"
        />
      </Field>

      <Notice tone="info">
        Once attached it stays attached. Re-pointing a sample at a different enquiry would
        rewrite what was made for whom.
      </Notice>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !enquiry}>
          {busy ? 'Attaching…' : 'Attach'}
        </button>
      </div>
    </form>
  );
}

/**
 * Where this request is, and what has to happen to it — the top of the screen, in words.
 *
 * The stage used to be a small chip in the header actions, sharing a row with five buttons.
 * That is the one fact somebody opens this page for, and it was the smallest thing on it.
 *
 * Three parts, in the order a person asks them: where it is now, what to do about it, and how
 * far along the run that is. No bar of its own — the stage pipeline sits directly beneath and
 * draws a segment per stage, which says more than one fill could, and two bars stacked would
 * read as two different measurements.
 */
function StageBanner({ sample }) {
  /* Counted the way the stepper below draws it, so the two never disagree. */
  const rank = SAMPLE_STAGE_RANK[sample.status];
  const done = CLOSED_SAMPLE_STAGES.includes(sample.status);

  return (
    <div
      className={`mb-5 rounded-xl border p-5 ${
        sample.isOverdue ? 'border-danger-500/40 bg-danger-500/[0.05]' : 'border-line/10 bg-line/[0.02]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-sm font-semibold text-steel-400">Where it is now</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-steel-50">
            {sampleStageLabel(sample.status)}
          </p>
        </div>

        {/* The instruction, as large as the stage it follows from. This is what the page is for. */}
        {sample.nextStep ? (
          <div>
            <p className="text-sm font-semibold text-steel-400">What happens next</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-accent">
              {sample.nextStep}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-steel-400">What happens next</p>
            {/*
              The record carries a sentence for every status the *bench* owns. The three that
              are left are each a different answer, and "waiting on the customer" for all of
              them would be wrong twice: a finished request waits on nobody, and a brand-new
              one is waiting on us.
            */}
            <p className="mt-1 text-lg font-bold text-steel-300">
              {done
                ? 'Nothing — this request is finished'
                : WITH_CUSTOMER_STAGES.includes(sample.status)
                  ? 'Waiting on the customer to come back'
                  : 'Nobody has started this yet — pick it up'}
            </p>
          </div>
        )}
      </div>

      {sample.isOverdue && (
        <p className="mt-3 text-base font-bold text-danger-400">
          This is past the day it was wanted.
        </p>
      )}

      {/* No bar of its own: the stage pipeline sits directly beneath this and draws one
          segment per stage, which says more than a single fill could. */}
      <p className="mt-3 text-sm text-steel-400">
        {rank !== undefined && <>Step {rank + 1} of {RUN.length} &mdash; </>}
        raised {formatDate(sample.requestedAt)}
      </p>
    </div>
  );
}

export default function SampleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canRead, canWrite } = useAuth();
  /* The stage a card asked for that needs telling something first — or null. */
  const [movingStage, setMovingStage] = useState(null);
  const [givingFeedback, setGivingFeedback] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [namingCustomer, setNamingCustomer] = useState(false);
  const [messagesKey, setMessagesKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetch = useCallback((sampleId) => samplesApi.get(sampleId), []);
  const { data: sample, setData, loading, error, reload } = useRecord(fetch, id);

  if (loading) return <Spinner label="Loading sample" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!sample) return null;

  const maySample = canWrite('samples');
  /*
   * Recording the outcome is normally marketing's, because it is the customer's verdict.
   * A request with no customer has no such verdict — an internal trial is the bench's to
   * judge — and the server allows exactly that, so the button has to as well.
   */
  const mayGiveFeedback = canWrite('enquiries') || (!sample.customer && canWrite('samples'));
  const mayMessage = canWrite('customer_comms');
  const mayReadMessages = canRead('customer_comms');
  // Only the stages §42.5 makes eligible have anything to say to a customer.
  const notifiable = NOTIFIABLE_STAGES[sample.status];
  const closed = CLOSED_SAMPLE_STAGES.includes(sample.status);
  /*
   * The models in the bag. The fields on the request itself are the first of them — the server
   * keeps the two in step — so a request written before the list existed still reads as a bag
   * of one rather than as a bag of none.
   */
  const bag = sample.items?.length ? sample.items : [sample];
  const withCustomer = WITH_CUSTOMER_STAGES.includes(sample.status);
  const due = followUpState(sample.requiredDate);

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
          /*
           * Either side can be absent: a counter request has no enquiry, an internal trial has
           * no customer either. Linking to an id that is not there is worse than not.
           *
           * The lead comes before "internal request" and after the customer. A request raised
           * for a party who is not a customer yet has a company behind it and calling that an
           * internal trial is simply wrong — and once the lead converts the sample gains the
           * customer, so the customer is the better answer the moment there is one.
           */
          <>
            {sample.customer ? (
              <Link to={`/customers/${sample.customer._id}`} className="hover:text-accent">
                {sample.customer.name}
              </Link>
            ) : sample.lead ? (
              <Link to={`/leads/${sample.lead._id}`} className="hover:text-accent">
                {sample.lead.company} <span className="text-steel-500">(lead)</span>
              </Link>
            ) : (
              'Internal request'
            )}
            {' · '}
            {sample.enquiry ? (
              <Link to={`/enquiries/${sample.enquiry._id}`} className="hover:text-accent">
                {sample.enquiry.number}
              </Link>
            ) : (
              'No enquiry'
            )}
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

            {/*
              Correcting the request itself.
              
              A sample request is typed in a hurry off a phone call, and the size, the shade or
              the date is wrong often enough that the only alternative — abandon it and raise a
              second — leaves two samples for one job on the bench's queue.

              Not once it is closed: a finished sample is a record of what was actually sent, and
              editing that is rewriting history rather than correcting a request.
            */}
            {maySample && !closed && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit the request
              </button>
            )}

            {maySample && !sample.enquiry && !closed && (
              <button type="button" className="btn-secondary" onClick={() => setLinking(true)}>
                Attach to an enquiry
              </button>
            )}

            {/* Only where there is nobody to name and no enquiry to name them: with an
                enquiry the customer comes from there, and the server refuses the rest. */}
            {maySample && !sample.enquiry && !sample.customer && !closed && (
              <button type="button" className="btn-secondary" onClick={() => setNamingCustomer(true)}>
                Name the customer
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

            {mayMessage && notifiable && (
              <button type="button" className="btn-secondary" onClick={() => setMessaging(true)}>
                Tell the customer
              </button>
            )}

            {mayGiveFeedback && (withCustomer || (!sample.customer && sample.status === 'sample_ready')) && (
              <button type="button" className="btn-primary" onClick={() => setGivingFeedback(true)}>
                Record feedback
              </button>
            )}

          </div>
        }
      />

      <StageBanner sample={sample} />

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

      <StagePanel
        sample={sample}
        mayMove={maySample && !closed}
        onSaved={setData}
        onAsk={setMovingStage}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Section
            title={bag.length > 1 ? `What to make (${bag.length} models)` : 'What to make'}
          >
            {/*
              Every model in the envelope as a peer.

              It used to be "What to make — the first model" here, with the rest under "Also in
              the bag" as a line of run-together text each. A buyer comparing three hangers asks
              for one envelope and each of those hangers is a model in its own right — its own
              tool, its own resin, its own parts, its own count — so each gets the same card.
              The old arrangement showed models two and three without their tool, which is the
              one thing the bench most needs.
            */}
            <ItemList items={bag} withQuantity bagTotal={formatNumber(sample.piecesToMake)} />

            {/* What belongs to the request rather than to any one model in it. */}
            <div className="mt-5 border-t border-line/[0.06] pt-4">
              <Facts
                items={[
                  { label: 'Purpose', value: optionLabel(SAMPLE_PURPOSES, sample.purpose) },
                  { label: 'Remarks', value: sample.remarks, wide: true },
                ]}
              />
            </div>
          </Section>

          <ReferencePhoto sample={sample} mayEdit={maySample && !closed} onSaved={setData} />

          <SampleLog sampleId={sample._id} />

          {(maySample || sample.courier) && (
            <Section
              title="Courier"
              actions={
                maySample && !closed ? (
                  <button type="button" className="row-action" onClick={() => setEditingDispatch(true)}>
                    {sample.courier ? 'Edit' : 'Add details'}
                  </button>
                ) : null
              }
            >
              {sample.courier || sample.awbNumber ? (
                <Facts
                  items={[
                    { label: 'Courier', value: sample.courier },
                    { label: 'Tracking number', value: sample.awbNumber },
                    { label: 'Sent on', value: sample.dispatchedAt && formatDate(sample.dispatchedAt) },
                    { label: 'Quantity sent', value: sample.dispatchedQuantity && formatNumber(sample.dispatchedQuantity) },
                    { label: 'Colour sent', value: sample.dispatchedColour },
                    { label: 'Delivered on', value: sample.deliveredAt && formatDate(sample.deliveredAt) },
                  ]}
                />
              ) : (
                <p className="text-sm text-steel-500">
                  Not arranged yet. Adding the courier before you dispatch means the customer is
                  told how it is coming when the sample is ready.
                </p>
              )}
            </Section>
          )}

          {mayReadMessages && <CustomerMessages sampleId={sample._id} refreshKey={messagesKey} />}

          <Section title={`Stage history (${sample.statusHistory?.length || 0})`}>
            {sample.statusHistory?.length ? (
              <ol className="space-y-3">
                {[...sample.statusHistory].reverse().map((entry, index) => {
                  const wentBack = isBackwardSampleMove(entry.from, entry.to);
                  return (
                    <li key={`${entry.to}-${entry.at}-${index}`} className="flex gap-3">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${wentBack ? 'bg-warn-400' : 'bg-flame-500'}`}
                      />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm text-steel-100">
                          <span>
                            {entry.from ? `${sampleStageLabel(entry.from)} ${wentBack ? '↩' : '→'} ` : 'Raised as '}
                            <span className="font-semibold">{sampleStageLabel(entry.to)}</span>
                          </span>
                          {wentBack && <Badge tone="progress">Sent back</Badge>}
                        </p>
                        <p className="text-xs text-steel-500">
                          {formatDate(entry.at)}
                          {entry.by?.name && ` · ${entry.by.name}`}
                        </p>
                        {entry.note && (
                          <p
                            className={`mt-1 text-xs ${
                              wentBack
                                ? 'rounded-md border-l-2 border-warn-500/60 bg-warn-500/[0.06] px-2 py-1 text-steel-200'
                                : 'text-steel-400'
                            }`}
                          >
                            {entry.note}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-steel-500">No moves recorded.</p>
            )}
          </Section>

          {/* The stage history says how it moved; this says who changed the quantity, the
              specification or the promised date. */}
          <HistoryPanel model="Sample" id={sample._id} refreshKey={sample.updatedAt} />
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
                  label: 'Raised without an enquiry',
                  value: !sample.enquiry ? sample.standaloneReason || 'Yes' : undefined,
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
        open={editing}
        title={`Edit ${sample.number}`}
        description="The same form that raised it, so there is one place a field can be wrong"
        onClose={() => setEditing(false)}
        size="lg"
      >
        <SampleRequestForm
          sample={sample}
          onClose={() => setEditing(false)}
          onSaved={reload}
        />
      </Modal>

      <Modal
        open={Boolean(movingStage)}
        title={
          movingStage === 'cancelled'
            ? 'Cancel this request'
            : movingStage === 'dispatched'
              ? 'Dispatch the sample'
              : isBackwardSampleMove(sample.status, movingStage)
                ? 'Send the sample back'
                : 'Move stage'
        }
        description={sample.number}
        onClose={() => setMovingStage(null)}
      >
        {movingStage && (
          <StageForm
            key={movingStage}
            sample={sample}
            to={movingStage}
            onClose={() => setMovingStage(null)}
            onSaved={setData}
          />
        )}
      </Modal>

      <Modal
        open={namingCustomer}
        title="Name the customer"
        description="For a request raised at the counter, or a trial that turned into real work"
        onClose={() => setNamingCustomer(false)}
      >
        <NameCustomerForm
          sample={sample}
          onClose={() => setNamingCustomer(false)}
          onSaved={setData}
        />
      </Modal>

      <Modal
        open={linking}
        title="Attach to an enquiry"
        description="For a request raised before anybody wrote the enquiry"
        onClose={() => setLinking(false)}
      >
        <LinkEnquiryForm sample={sample} onClose={() => setLinking(false)} onSaved={setData} />
      </Modal>

      <Modal
        open={editingDispatch}
        title="Courier details"
        description="Record them whenever they are known — before dispatch, or to correct them after"
        onClose={() => setEditingDispatch(false)}
      >
        <DispatchDetailsForm
          sample={sample}
          onClose={() => setEditingDispatch(false)}
          onSaved={setData}
        />
      </Modal>

      <Modal
        open={messaging}
        title="Tell the customer"
        description="Sample ready and dispatched already send themselves — this is for saying it again, or differently"
        size="lg"
        onClose={() => setMessaging(false)}
      >
        {messaging && notifiable && (
          <CustomerMessageForm
            sample={sample}
            event={notifiable}
            onClose={() => setMessaging(false)}
            onSent={() => setMessagesKey((key) => key + 1)}
          />
        )}
      </Modal>

      <Modal
        open={givingFeedback}
        title={sample.customer ? 'Record customer feedback' : 'Record how the trial went'}
        description={
          sample.customer
            ? 'Only the person who spoke to them can answer this'
            : 'An internal trial has no customer verdict — the bench’s own is the verdict'
        }
        onClose={() => setGivingFeedback(false)}
      >
        <FeedbackForm sample={sample} onClose={() => setGivingFeedback(false)} onSaved={setData} />
      </Modal>
    </div>
  );
}
