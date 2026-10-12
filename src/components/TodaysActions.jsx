import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { customers as customersApi, overview } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { ErrorState, Field, FormError, Modal } from './ui.jsx';
import { formatDate, formatDateTime } from '../utils/format.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const time = (value) => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();

/* A date-time box's value for a moment, in the reader's own clock. */
const localInput = (date) => {
  const at = new Date(date);
  at.setMinutes(at.getMinutes() - at.getTimezoneOffset());
  return at.toISOString().slice(0, 16);
};
/* Tomorrow at ten — the follow-up a person usually means. */
const tomorrowAtTen = () => {
  const at = new Date(Date.now() + DAY_MS);
  at.setHours(10, 0, 0, 0);
  return localInput(at);
};

/** "Due 10:30 AM", "Overdue 2 days", "Due 14 Oct 2026" — an enquiry's date has no time of day. */
function dueText(item) {
  const due = new Date(item.due);
  if (item.state === 'overdue') {
    const days = Math.max(1, Math.round((Date.now() - due.getTime()) / DAY_MS));
    return `Overdue ${days} day${days === 1 ? '' : 's'}`;
  }
  if (item.state === 'today') return item.kind === 'customer' ? `Due ${time(due)}` : 'Due today';
  return `Due ${formatDate(due)}${item.kind === 'customer' ? `, ${time(due)}` : ''}`;
}

function tagOf(item) {
  if (item.state === 'overdue') return { text: 'Urgent', tone: 'text-danger-400' };
  if (item.tag === 'High') return { text: 'High', tone: 'text-danger-400' };
  return { text: item.tag, tone: 'text-steel-400' };
}

const KIND_TEXT = { set: 'Follow-up set', log: 'Call logged', close: 'Closed' };

/**
 * A customer's follow-up, in one dialog [server: customerFollowUp.controller.js]: set one with a
 * date and a note, log what happened on a call (and when to call next), close it — with every
 * step it has had listed underneath, newest first.
 */
export function FollowUpDialog({ customer, mode: startMode, onClose, onChanged }) {
  const [history, setHistory] = useState(null);
  const [mode, setMode] = useState(startMode);
  const [due, setDue] = useState(tomorrowAtTen());
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState('normal');
  const [next, setNext] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    customersApi.followUp(customer._id)
      .then((data) => {
        if (!live) return;
        setHistory(data);
        /* Nothing open: logging and closing need one, so start on setting it. */
        if (!data.followUp && startMode !== 'log') setMode('set');
        if (data.followUp && startMode === 'set') {
          setDue(localInput(data.followUp.due));
          setNote(data.followUp.note || '');
          setPriority(data.followUp.priority || 'normal');
        }
      })
      .catch((failure) => live && setError(failure));
    return () => { live = false; };
  }, [customer._id, startMode]);

  const open = history?.followUp;
  const save = async (event) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = mode === 'set'
        ? { action: 'set', due: new Date(due).toISOString(), note: note.trim() || undefined, priority }
        : mode === 'log'
          ? { action: 'log', note: note.trim(), next: next ? new Date(next).toISOString() : undefined }
          : { action: 'close', note: note.trim() || undefined };
      const data = await customersApi.followUpAction({ id: customer._id, ...payload });
      setHistory(data);
      onChanged?.();
      onClose();
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };

  const modes = [['set', open ? 'Reschedule' : 'Set follow-up'], ['log', 'Log a call'], ...(open ? [['close', 'Close follow-up']] : [])];

  return (
    <Modal open title={`Follow-up · ${customer.name}`} description={open ? `Open — due ${formatDateTime(open.due)}${open.note ? ` · ${open.note}` : ''}` : 'No follow-up open'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div role="tablist" aria-label="What to do" className="flex flex-wrap gap-1.5">
          {modes.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => { setMode(value); setError(null); }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${mode === value ? 'fill-primary border-transparent' : 'border-line/[0.12] text-steel-300 hover:border-line/25'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'set' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="When" required>
              <input type="datetime-local" className="input" value={due} onChange={(event) => setDue(event.target.value)} required />
            </Field>
            <Field label="Priority">
              <select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="What to follow up" className="sm:col-span-2">
              <input className="input" placeholder="Send product photos" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>
        )}
        {mode === 'log' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What happened" className="sm:col-span-2" required>
              <textarea rows={3} className="input" placeholder="Spoke to Ravi — wants photos of the 400mm in black" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} required />
            </Field>
            <Field label="Next call" hint={open ? 'Moves the follow-up to this time; leave blank to keep it' : 'Sets a follow-up; leave blank for none'}>
              <input type="datetime-local" className="input" value={next} onChange={(event) => setNext(event.target.value)} />
            </Field>
          </div>
        )}
        {mode === 'close' && (
          <Field label="How it ended" hint="Optional">
            <input className="input" placeholder="Photos sent, they will order next week" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        )}

        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || (mode === 'log' && note.trim().length < 2)}>
            {saving ? 'Saving…' : mode === 'set' ? (open ? 'Reschedule' : 'Set follow-up') : mode === 'log' ? 'Log it' : 'Close follow-up'}
          </button>
        </div>
      </form>

      <div className="mt-5 border-t border-line/[0.08] pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-steel-400">History</p>
        {!history ? (
          <p className="mt-2 text-sm text-steel-500">Loading…</p>
        ) : history.log.length ? (
          <ol className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1" aria-label="Follow-up history">
            {history.log.map((line) => (
              <li key={line._id} className="rounded-lg border border-line/[0.06] px-3 py-2 text-sm">
                <p className="text-xs text-steel-400">
                  <span className={`font-semibold ${line.kind === 'close' ? 'text-success-400' : 'text-steel-200'}`}>{KIND_TEXT[line.kind]}</span>
                  {' · '}{formatDateTime(line.at)}{line.by?.name ? ` · ${line.by.name}` : ''}
                </p>
                {line.note && <p className="text-steel-100">{line.note}</p>}
                {line.due && <p className="text-xs text-steel-400">{line.kind === 'set' ? 'Due' : 'Next call'} {formatDateTime(line.due)}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-steel-500">Nothing logged yet.</p>
        )}
      </div>
    </Modal>
  );
}

/**
 * Today's actions, beside the customer list: every open customer follow-up and the enquiries
 * due by tonight, soonest first [server: overview.service `followUpsFor`]. A customer's is
 * logged or closed from here; an enquiry's opens the enquiry, where its call log lives.
 */
export default function TodaysActions({ refreshKey, onChanged }) {
  const fetch = useCallback(() => overview.followUps(), []);
  const { data, loading, error, reload } = useRecord(fetch, `follow-ups-${refreshKey}`);
  const [working, setWorking] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const items = data?.items || [];
  const dueNow = items.filter((item) => item.state !== 'upcoming');
  const upcoming = items.filter((item) => item.state === 'upcoming');
  const shown = showAll ? items : dueNow;

  const changed = () => {
    reload();
    onChanged?.();
  };

  return (
    <section className="card flex flex-col overflow-hidden lg:sticky lg:top-20" aria-label="Today's actions">
      <div className="flex items-baseline justify-between gap-2 border-b border-line/10 px-4 py-3.5">
        <h2 className="text-lg font-bold text-steel-50">Today&rsquo;s actions</h2>
        <p className="text-sm text-steel-400">{data ? `${data.pending} pending` : '…'}</p>
      </div>
      {error ? (
        <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>
      ) : loading && !data ? (
        <p className="px-4 py-6 text-center text-sm text-steel-400">Loading…</p>
      ) : (
        <>
          {shown.length ? (
            <ul className="max-h-[36rem] divide-y divide-line/10 overflow-y-auto">
              {shown.map((item) => {
                const tag = tagOf(item);
                const who = item.customer?.name || item.prospect;
                return (
                  <li key={item._id} className="px-4 py-3">
                    {item.kind === 'enquiry' ? (
                      <Link to={`/enquiries/${item.enquiry._id}`} className="font-bold text-steel-50 hover:text-accent">{item.title}</Link>
                    ) : (
                      <button type="button" className="text-left font-bold text-steel-50 hover:text-accent" onClick={() => setWorking({ customer: item.customer, mode: 'log' })}>
                        {item.title}
                      </button>
                    )}
                    <p className="truncate text-sm text-steel-400">
                      {[who, item.context].filter(Boolean).join(' · ')}
                      {item.prospect && <span className="ml-1 text-xs text-warn-400">(prospect)</span>}
                    </p>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-sm">
                      <span className={item.state === 'overdue' ? 'font-semibold text-danger-400' : 'text-steel-300'}>{dueText(item)}</span>
                      <span className={`text-xs font-semibold ${tag.tone}`}>{tag.text}</span>
                    </div>
                    {item.kind === 'customer' && (
                      <div className="mt-1.5 flex gap-3 text-xs font-semibold">
                        <button type="button" className="text-accent hover:underline" onClick={() => setWorking({ customer: item.customer, mode: 'log' })}>Log call</button>
                        <button type="button" className="text-accent hover:underline" onClick={() => setWorking({ customer: item.customer, mode: 'set' })}>Reschedule</button>
                        <button type="button" className="text-steel-400 hover:text-success-400 hover:underline" onClick={() => setWorking({ customer: item.customer, mode: 'close' })}>Close</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-steel-400">
              Nothing due today.{upcoming.length ? '' : ' Set a follow-up from a customer’s row.'}
            </p>
          )}
          {upcoming.length > 0 && (
            <button type="button" className="border-t border-line/10 px-4 py-2.5 text-left text-sm font-semibold text-accent hover:bg-line/[0.03]" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show today’s only' : `Upcoming (${upcoming.length}) →`}
            </button>
          )}
        </>
      )}
      {working && (
        <FollowUpDialog
          customer={working.customer}
          mode={working.mode}
          onClose={() => setWorking(null)}
          onChanged={changed}
        />
      )}
    </section>
  );
}
