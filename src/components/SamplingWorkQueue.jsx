import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { documents as documentsApi, samples as samplesApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { DashboardSkeleton, ErrorState, Field, FormError, Modal } from './ui.jsx';
import AuthedImage from './AuthedImage.jsx';
import SampleReadyForm from './SampleReadyForm.jsx';
import { formatDate } from '../utils/format.js';
import {
  CHIPS, SAMPLE_COURIERS, SETS, TILE_FILTERS, UNSENT, filterFor, needsReason, optionsFor,
} from '../utils/samplingQueue.js';

/**
 * The sampling department's work queue [server: sampleDashboard.controller `sampleQueue`].
 *
 * One row per sample request: the buyer and models, what is asked for, who has it, a status
 * dropdown in the team's own words, priority and due date, and the handover. Setting a status
 * here is the same move as on the sample itself, so the notifications follow the design:
 *
 *   Sample Ready  → the buyer gets the WhatsApp and the email; marketing gets a task
 *   Sample Sent   → (through the handover form) the buyer gets the dispatch WhatsApp and email,
 *                   the enquiry moves to feedback, marketing gets "chase feedback"
 *   Not Available → marketing gets an urgent task with the reason
 */

const STATUS_TONE = {
  received: 'bg-flame-500/10 text-flame-400',
  not_available: 'bg-danger-500/15 text-danger-400',
  under_process: 'bg-warn-500/15 text-warn-400',
  ready: 'bg-success-500/15 text-success-400',
  sent: 'bg-aqua-300/15 text-aqua-300',
  closed: 'bg-line/[0.08] text-steel-400',
};

function Tile({ label, hint, value, tone = 'text-steel-50', to, onClick, active }) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value ?? '—'}</p>
      <p className="mt-1 text-xs text-steel-400">{hint}</p>
    </>
  );
  const className = `card p-4 text-left transition hover:border-flame-500/40 ${active ? 'border-flame-500/60 ring-1 ring-flame-500/30' : ''}`;
  return to ? <Link to={to} className={className}>{body}</Link> : <button type="button" className={className} onClick={onClick}>{body}</button>;
}

/** Customer, the "New Enquiry" badge, who asked, and the models in the bag. */
function CustomerCell({ row }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {row.enquiry ? (
          <Link to={`/enquiries/${row.enquiry._id}`} className="font-semibold text-steel-50 hover:text-accent">
            {row.customer?.name || 'No buyer named'}
          </Link>
        ) : (
          <span className="font-semibold text-steel-50">{row.customer?.name || 'No buyer named'}</span>
        )}
        {row.fresh && <span className="rounded-full bg-flame-500/15 px-2 py-0.5 text-[0.75rem] font-bold uppercase tracking-wide text-flame-400">New Enquiry</span>}
      </div>
      {row.requestedBy && <p className="mt-0.5 text-xs text-steel-400">Requested by: {row.requestedBy}</p>}
      <p className="mt-0.5 text-xs text-steel-300">
        {row.models.map((item) => `${item.model || 'New model'}: ${item.quantity} pcs`).join(' · ')}
      </p>
      {/* The finished pieces, as thumbnails: marketing sees the piece without opening the request. */}
      {row.models.some((item) => item.photo) && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`Finished pieces on ${row.number}`}>
          {row.models.filter((item) => item.photo).map((item) => (
            <li key={item._id || item.photo} className="h-12 w-12 overflow-hidden rounded-md border border-line/[0.08]" title={item.model || ''}>
              <AuthedImage attachmentKey={item.photo} alt={`Finished ${item.model || 'piece'}`} className="h-full w-full object-cover" />
            </li>
          ))}
        </ul>
      )}
      {row.problem && (
        <p className="mt-1 text-[0.75rem] font-semibold text-danger-400">Problem flagged: {row.problem.words} — {row.problem.note}</p>
      )}
      {row.nudge && <p className="mt-1 text-[0.75rem] font-semibold text-warn-400">{row.nudge}</p>}
      {row.chaseDrafted && <p className="mt-1 text-[0.75rem] text-aqua-300">A chase to the buyer is drafted on the sample</p>}
      {row.photos && row.queueStatus === 'ready' && row.photos.taken < row.photos.of && (
        <p className="mt-1 text-[0.75rem] font-semibold text-warn-400">Ready without a photo of every piece ({row.photos.taken} of {row.photos.of})</p>
      )}
      <Link to={row.link} className="mt-0.5 inline-block text-[0.75rem] text-steel-500 hover:text-accent">{row.number}</Link>
    </div>
  );
}

function HandoverLine({ handover }) {
  if (!handover) return null;
  return (
    <p className="mt-1 text-xs text-steel-400">
      {handover.method === 'direct'
        ? `Handed to ${[handover.handedTo, handover.recipientPhone].filter(Boolean).join(' · ')}`
        : `${handover.courier || 'Courier'}${handover.awbNumber ? ` · ${handover.awbNumber}` : ''}`}
      {handover.at && ` · ${formatDate(handover.at)}`}
    </p>
  );
}

function StatusSelect({ row, statuses, onPick, busy }) {
  const labelOf = (key) => statuses.find((entry) => entry.key === key)?.label || key;
  return (
    <div>
      <select
        aria-label={`Status of ${row.number}`}
        className={`input min-w-[13.5rem] py-1.5 text-sm font-semibold ${STATUS_TONE[row.queueStatus] || ''}`}
        value={row.queueStatus}
        disabled={busy || row.closed}
        onChange={(event) => onPick(row, event.target.value)}
      >
        {optionsFor(row).map((key) => <option key={key} value={key}>{labelOf(key)}</option>)}
      </select>
      {row.queueStatus === 'not_available' && row.lastNote && (
        <p className="mt-1 text-xs text-danger-400">{row.lastNote}</p>
      )}
      <HandoverLine handover={row.handover} />
    </div>
  );
}

function PriorityCell({ row }) {
  return (
    <div className="text-sm">
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${row.priority === 'urgent' ? 'bg-danger-500/15 text-danger-400' : 'bg-line/[0.06] text-steel-300'}`}>
        {row.priority === 'urgent' ? 'Urgent' : 'Normal'}
      </span>
      <p className={`mt-1 text-xs tabular-nums ${row.late ? 'font-semibold text-danger-400' : row.dueToday ? 'font-semibold text-warn-400' : 'text-steel-400'}`}>
        {row.requiredDate ? formatDate(row.requiredDate) : 'No date'}
        {row.late && ' · late'}
        {row.dueToday && ' · today'}
      </p>
    </div>
  );
}

/** A reason, for the moves that need one. */
function ReasonForm({ pending, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { row, to } = pending;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (to === 'closed') await samplesApi.closeTask({ id: row._id, note: note.trim() });
      else await samplesApi.setStatus({ id: row._id, status: SETS[to], note: note.trim() });
      onDone();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  const prompt = to === 'not_available'
    ? 'Why can it not be given? Marketing reads this to tell the buyer.'
    : to === 'closed'
      ? 'It has not gone out, so closing the task cancels the request. Say why.'
      : 'This moves it back. Say what went wrong, so the history explains it.';

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Reason" hint={prompt} required>
        <textarea rows={3} className="input" autoFocus value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <FormError error={error} />
      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || note.trim().length < 5}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

/**
 * Sample handover details: direct handover (a contact person or a phone) or courier (company,
 * AWB, the courier copy). Saving marks the sample sent, which messages the buyer.
 */
export function HandoverForm({ row, onClose, onDone }) {
  const [values, setValues] = useState({
    method: 'direct',
    handedTo: '',
    recipientPhone: '',
    courier: '',
    otherCourier: '',
    awbNumber: '',
    quantity: String(row.pieces || 1),
    colour: row.colour || '',
  });
  const [copy, setCopy] = useState(null);
  /* What the model read off the courier copy — a suggestion the bench checks, into the fields [server: readCourierCopy]. */
  const [reading, setReading] = useState(null);
  /* Sent is the end of the bench's work: the task closes with the move unless the bench unticks it. */
  const [closeTask, setCloseTask] = useState(true);
  /* Another shade against an exact-colour condition: allowed out loud — ticked, with a reason, marketing told. */
  const [anyway, setAnyway] = useState(false);
  const [anywayReason, setAnywayReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  /* The courier copy chosen: read it, and offer what it says where the fields are still empty. */
  const pickCopy = async (file) => {
    setCopy(file);
    setReading(null);
    if (!file || !file.type.startsWith('image/')) return;
    setReading({ busy: true });
    try {
      const read = await samplesApi.readCourierCopy(file);
      setReading(read);
      if (read.problem) return;
      setValues((current) => ({
        ...current,
        courier: current.courier || (SAMPLE_COURIERS.includes(read.courier) ? read.courier : read.courier ? 'Other' : ''),
        otherCourier: current.otherCourier || (read.courier && !SAMPLE_COURIERS.includes(read.courier) ? read.courier : ''),
        awbNumber: current.awbNumber.trim() || read.awbNumber,
      }));
    } catch (readError) {
      setReading({ problem: readError.message });
    }
  };

  const direct = values.method === 'direct';
  const phoneOk = !values.recipientPhone || /^\d{10}$/.test(values.recipientPhone);
  const courierName = values.courier === 'Other' ? values.otherCourier.trim() : values.courier;
  const sameShade = (a, b) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') === String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const substituting = Boolean(row.colour) && Boolean(values.colour.trim()) && !sameShade(row.colour, values.colour);
  const exactBroken = substituting && row.models?.some((item) => item.colourMandatory);
  const stepOk = !exactBroken || (anyway && anywayReason.trim().length >= 5);
  const ready = (direct
    ? (values.handedTo.trim() || values.recipientPhone) && phoneOk
    : courierName && values.awbNumber.trim()) && stepOk;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await samplesApi.setStatus({
        id: row._id,
        status: 'dispatched',
        deliveryMethod: values.method,
        ...(direct
          ? { handedTo: values.handedTo.trim() || undefined, recipientPhone: values.recipientPhone || undefined }
          : { courier: courierName, awbNumber: values.awbNumber.trim() }),
        dispatchedQuantity: Number(values.quantity) || undefined,
        dispatchedColour: values.colour.trim() || undefined,
        closeTask,
        ...(exactBroken && anyway ? { colourOverride: true, colourOverrideReason: anywayReason.trim() } : {}),
      });
      if (!direct && copy) {
        await documentsApi.add({ collection: 'samples', id: row._id, file: copy, title: `Courier copy — ${values.awbNumber.trim()}` });
      }
      onDone();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-steel-200">Delivery method</legend>
        <div className="grid grid-cols-2 gap-2">
          {[['direct', 'Direct handover'], ['courier', 'Courier']].map(([key, label]) => (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                values.method === key ? 'border-flame-500 bg-flame-500/10 text-flame-400' : 'border-line/[0.1] text-steel-300'
              }`}
            >
              <input type="radio" name="method" value={key} checked={values.method === key} onChange={set('method')} className="accent-flame-500" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {direct ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Handed over to / Contact person">
              <input className="input" placeholder="Mr Ravi, purchase" value={values.handedTo} onChange={set('handedTo')} autoFocus />
            </Field>
            <Field label="Recipient phone number" error={phoneOk ? undefined : 'A 10-digit number'}>
              <input
                className="input"
                inputMode="numeric"
                maxLength={10}
                placeholder="9876543210"
                value={values.recipientPhone}
                onChange={(event) => setValues({ ...values, recipientPhone: event.target.value.replace(/\D/g, '').slice(0, 10) })}
              />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-steel-500">Enter either a contact person or a phone number.</p>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Courier company" required>
              <select className="input" value={values.courier} onChange={set('courier')} autoFocus>
                <option value="">Choose…</option>
                {SAMPLE_COURIERS.map((name) => <option key={name} value={name}>{name}</option>)}
                <option value="Other">Other</option>
              </select>
            </Field>
            {values.courier === 'Other' && (
              <Field label="Which courier" required>
                <input className="input" value={values.otherCourier} onChange={set('otherCourier')} />
              </Field>
            )}
            <Field label="AWB / Tracking number" required>
              <input className="input" value={values.awbNumber} onChange={set('awbNumber')} />
            </Field>
          </div>
          <Field label="Courier copy" hint="Optional — a photo or PDF of the receipt. A photo is read: the courier and AWB are offered above, for you to check.">
            <input type="file" accept="image/*,application/pdf" className="input" onChange={(event) => pickCopy(event.target.files?.[0] || null)} />
          </Field>
          {reading && (
            <p className={`-mt-2 text-xs ${reading.problem ? 'text-steel-400' : 'text-aqua-300'}`} aria-live="polite">
              {reading.busy ? 'Reading the slip…' : reading.problem ? reading.problem : `Read from the slip: ${[reading.courier, reading.awbNumber].filter(Boolean).join(' · ')} — check it against the receipt before saving.`}
            </p>
          )}
        </>
      )}

      <div className="grid gap-4 border-t border-line/[0.06] pt-4 sm:grid-cols-2">
        <Field label="Pieces sent">
          <input type="number" min={1} className="input" value={values.quantity} onChange={set('quantity')} />
        </Field>
        {row.colour && (
          <Field label="Colour sent" hint={`Asked for ${row.colour}${row.models?.some((item) => item.colourMandatory) ? ' — exactly, as a condition' : ''}`}>
            <input className="input" value={values.colour} onChange={set('colour')} />
          </Field>
        )}
      </div>

      {exactBroken && (
        <div className="rounded-lg border border-danger-500/40 bg-danger-500/[0.06] p-3 text-sm" role="alert">
          <p className="font-semibold text-danger-400">
            {row.colour} exactly was a condition of this request, and {values.colour.trim()} is not it.
          </p>
          <p className="mt-1 text-xs text-steel-300">Send it in {row.colour}, ask {row.requestedBy || 'marketing'} to drop the condition — or send it anyway and say why. Marketing is told the moment it goes.</p>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-flame-500" checked={anyway} onChange={(event) => setAnyway(event.target.checked)} />
            <span className="font-semibold text-steel-100">Send it anyway — marketing is told</span>
          </label>
          {anyway && (
            <input className="input mt-2" placeholder="Why — the buyer said so on the phone, the fit is what matters…" aria-label="Why send it anyway" value={anywayReason} onChange={(event) => setAnywayReason(event.target.value)} />
          )}
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line/[0.08] px-3 py-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-flame-500" checked={closeTask} onChange={(event) => setCloseTask(event.target.checked)} />
        <span>
          <span className="font-semibold text-steel-100">Close the task on the bench</span>
          <span className="block text-xs text-steel-400">The sample has left; it comes off the work queue. Untick to keep it here, for example to send a second bag.</span>
        </span>
      </label>

      <p className="rounded-lg bg-aqua-300/10 px-3 py-2 text-xs text-aqua-300">
        Saving tells the buyer on WhatsApp and email, moves the enquiry to feedback, and tells
        {' '}{row.requestedBy || 'marketing'} to chase the feedback{closeTask ? '; the task closes here' : ''}.
      </p>

      <FormError error={error} />
      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !ready || (!direct && !values.courier)}>
          {busy ? 'Saving…' : 'Save & Mark Sample Sent'}
        </button>
      </div>
    </form>
  );
}

export default function SamplingWorkQueue() {
  const fetch = useCallback(() => samplesApi.queue(), []);
  const { data, loading, error, reload } = useRecord(fetch, 'sampling-queue');
  const [chip, setChip] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [problem, setProblem] = useState(null);
  const [reasoning, setReasoning] = useState(null);
  const [handing, setHanding] = useState(null);
  /* Sample Ready asks for the photos first [SampleReadyForm]. */
  const [readying, setReadying] = useState(null);

  const rows = data?.rows || [];
  const statuses = data?.statuses || [];

  const shown = useMemo(() => {
    const test = filterFor(chip);
    const term = search.trim().toLowerCase();
    return rows.filter((row) => test(row) && (!term || [row.customer?.name, row.number, row.requestedBy, row.request, row.enquiry?.number]
      .filter(Boolean).some((text) => text.toLowerCase().includes(term))));
  }, [rows, chip, search]);

  if (loading && !data) return <DashboardSkeleton label="Loading the work queue" tiles={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { tiles } = data;

  const pick = async (row, to) => {
    if (to === row.queueStatus) return;
    setProblem(null);
    if (to === 'sent') return setHanding(row);
    if (to === 'ready') return setReadying(row);
    if (needsReason(row, to)) return setReasoning({ row, to });
    setBusyId(row._id);
    try {
      if (to === 'closed') await samplesApi.closeTask({ id: row._id });
      else await samplesApi.setStatus({ id: row._id, status: SETS[to] });
      await reload();
    } catch (moveError) {
      setProblem(`${row.number}: ${moveError.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const done = async () => {
    setReasoning(null);
    setHanding(null);
    setReadying(null);
    await reload();
  };

  return (
    <section className="space-y-4">
      <div className="card flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h2 className="text-xl font-bold text-steel-50">Department Work Queue</h2>
          <p className="mt-1 text-sm text-steel-400">Every request moves to the responsible team login and returns a live status.</p>
        </div>
        <span className="rounded-full border border-line/[0.1] bg-line/[0.04] px-3 py-1.5 text-xs font-semibold text-steel-300">
          Sampling Team login · Only assigned or tagged tasks are visible
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Open tasks" hint="In the sampling queue" value={tiles.open} active={chip === 'all'} onClick={() => setChip('all')} />
        <Tile label={TILE_FILTERS.late.label} hint={TILE_FILTERS.late.hint} value={tiles.late} tone={tiles.late ? 'text-danger-400' : 'text-steel-50'} active={chip === 'late'} onClick={() => setChip('late')} />
        <Tile label={TILE_FILTERS.today.label} hint={TILE_FILTERS.today.hint} value={tiles.dueToday} tone={tiles.dueToday ? 'text-warn-400' : 'text-steel-50'} active={chip === 'today'} onClick={() => setChip('today')} />
        <Tile label={TILE_FILTERS.ready.label} hint={TILE_FILTERS.ready.hint} value={tiles.readyToSend} tone={tiles.readyToSend ? 'text-flame-400' : 'text-steel-50'} active={chip === 'ready'} onClick={() => setChip('ready')} />
        <Tile label="Internal tags" hint="Department questions" value={tiles.internalTags} to="/queries" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((entry) => {
          const count = rows.filter(entry.test).length;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setChip(entry.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                chip === entry.key ? 'border-flame-500 bg-flame-500/10 text-flame-400' : 'border-line/[0.1] text-steel-400 hover:text-steel-200'
              }`}
            >
              {entry.label}
              <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
        <input aria-label="Search buyer, model or request"
          type="search"
          className="input ml-auto w-full sm:w-64"
          placeholder="Search buyer, model or request…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {problem && <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-400">{problem}</p>}

      {shown.length ? (
        <>
          {/* Wide screens: the table, as designed. */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line/[0.08] text-xs uppercase tracking-wide text-steel-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer / Model</th>
                  <th className="px-4 py-3 font-semibold">Request</th>
                  <th className="px-4 py-3 font-semibold">Assigned to</th>
                  <th className="px-4 py-3 font-semibold">Status update</th>
                  <th className="px-4 py-3 font-semibold">Priority / Due</th>
                  <th className="px-4 py-3 font-semibold">Internal action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr
                    key={row._id}
                    data-highlighted={row.highlighted || undefined}
                    className={`border-b border-line/[0.05] align-top ${row.highlighted ? 'border-l-4 border-l-warn-500 bg-warn-500/[0.07]' : ''}`}
                  >
                    <td className="min-w-[12rem] max-w-[16rem] px-4 py-3"><CustomerCell row={row} /></td>
                    <td className="max-w-[20rem] px-4 py-3 text-xs leading-relaxed text-steel-300">{row.request}</td>
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap rounded-full bg-flame-500/10 px-2.5 py-1 text-xs font-semibold text-flame-400">
                        {row.assignedTo?.name || 'Sampling Team'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusSelect row={row} statuses={statuses} onPick={pick} busy={busyId === row._id} />
                    </td>
                    <td className="px-4 py-3"><PriorityCell row={row} /></td>
                    <td className="px-4 py-3">
                      {UNSENT.includes(row.queueStatus) && !row.closed ? (
                        <button type="button" className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs" onClick={() => setHanding(row)}>
                          Sample handover
                        </button>
                      ) : (
                        <Link to={row.link} className="text-xs font-semibold text-steel-400 hover:text-accent">Open sample</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones and tablets: the same rows as cards. */}
          <div className="grid gap-3 lg:hidden">
            {shown.map((row) => (
              <article
                key={row._id}
                className={`card space-y-3 p-4 ${row.highlighted ? 'border-l-4 border-l-warn-500 bg-warn-500/[0.07]' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <CustomerCell row={row} />
                  <PriorityCell row={row} />
                </div>
                <p className="text-xs leading-relaxed text-steel-300">{row.request}</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[12rem] flex-1">
                    <StatusSelect row={row} statuses={statuses} onPick={pick} busy={busyId === row._id} />
                  </div>
                  {UNSENT.includes(row.queueStatus) && !row.closed && (
                    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setHanding(row)}>
                      Sample handover
                    </button>
                  )}
                </div>
                <p className="text-xs text-steel-500">Assigned to {row.assignedTo?.name || 'Sampling Team'}</p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="card px-6 py-10 text-center">
          <p className="text-base font-semibold text-steel-200">
            {rows.length ? 'Nothing matches this filter.' : 'No sample requests right now.'}
          </p>
          <p className="mt-1 text-sm text-steel-500">
            {rows.length ? 'Pick another, or clear the search.' : 'When marketing asks for a sample, it appears here.'}
          </p>
        </div>
      )}

      <Modal
        open={Boolean(handing)}
        title="Sample handover details"
        description={handing ? `${handing.number} · ${handing.customer?.name || ''}` : ''}
        onClose={() => setHanding(null)}
      >
        {handing && <HandoverForm row={handing} onClose={() => setHanding(null)} onDone={done} />}
      </Modal>

      <Modal
        open={Boolean(readying)}
        title="Sample ready — photograph each piece"
        description={readying ? `${readying.number} · ${readying.customer?.name || ''}` : ''}
        size="lg"
        onClose={() => setReadying(null)}
      >
        {readying && <SampleReadyForm sampleId={readying._id} onClose={() => setReadying(null)} onSaved={done} />}
      </Modal>

      <Modal
        open={Boolean(reasoning)}
        title={reasoning?.to === 'not_available' ? 'Sample not available' : reasoning?.to === 'closed' ? 'Close the task' : 'Move it back'}
        description={reasoning ? `${reasoning.row.number} · ${reasoning.row.customer?.name || ''}` : ''}
        onClose={() => setReasoning(null)}
      >
        {reasoning && <ReasonForm pending={reasoning} onClose={() => setReasoning(null)} onDone={done} />}
      </Modal>
    </section>
  );
}
