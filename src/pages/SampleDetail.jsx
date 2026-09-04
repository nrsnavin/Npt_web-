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
import { formatDate, formatNumber } from '../utils/format.js';
import {
  CLOSED_SAMPLE_STAGES, HANGER_CATEGORIES, MATERIALS, MESSAGE_CHANNELS, MESSAGE_EVENTS,
  NOTIFIABLE_STAGES,
  SAMPLE_PURPOSES, SAMPLE_STAGES, SKIP_REASONS, WITH_CUSTOMER_STAGES, followUpState,
  nextSampleStagesFrom, numeric, optionLabel, sampleStageLabel, text,
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
        <Field label="Tracking / AWB number">
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

export default function SampleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canRead, canWrite } = useAuth();
  const [movingStage, setMovingStage] = useState(false);
  const [givingFeedback, setGivingFeedback] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState(false);
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
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Section title="What to make">
            <Facts
              items={[
                { label: 'Purpose', value: optionLabel(SAMPLE_PURPOSES, sample.purpose) },
                {
                  label: 'Model',
                  value: sample.mould
                    ? `${sample.mould.mouldCode} — ${sample.mould.name}`
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

          {/* The stage history says how it moved; this says who changed the quantity, the
              specification or the promised date. */}
          <HistoryPanel model="Sample" id={sample._id} />
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
        open={movingStage}
        title="Move stage"
        description="Where the sample has got to on the bench"
        onClose={() => setMovingStage(false)}
      >
        <StageForm sample={sample} onClose={() => setMovingStage(false)} onSaved={setData} />
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
