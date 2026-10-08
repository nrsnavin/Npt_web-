import { useEffect, useState } from 'react';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { Field, FormError, Modal, Section } from './ui.jsx';
import { CLOSED_STAGES, inDays } from '../utils/pipeline.js';

/** When it happened, to the minute — "which call was that" is answered by the time of day. */
export const formatWhen = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : '—';

/** The kinds of activity, from the server's one list [server: config/enquiryActivities.js]. */
export function useActivityTypes() {
  const [types, setTypes] = useState([]);
  useEffect(() => {
    enquiriesApi.activityTypes().then(setTypes).catch(() => {});
  }, []);
  return types;
}

export const activityLabel = (types, key) => types.find((type) => type.key === key)?.label || key;

/**
 * Calls, WhatsApps, emails, visits and meetings with the buyer about this enquiry
 * [role requirements §2]. Newest first, so the next person to ring reads what was said last.
 */
export default function EnquiryActivities({ enquiry, canWrite, onSaved }) {
  const types = useActivityTypes();
  const [logging, setLogging] = useState(false);
  const activities = [...(enquiry.activities || [])].reverse();

  return (
    <Section
      title={`Calls and messages (${activities.length})`}
      actions={canWrite && (
        <button type="button" className="btn-secondary" onClick={() => setLogging(true)}>
          Log a call
        </button>
      )}
    >
      {activities.length ? (
        <ol className="space-y-3">
          {activities.map((activity) => (
            <li key={activity._id} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aqua-300" />
              <div className="min-w-0">
                <p className="text-sm text-steel-100">
                  <span className="font-semibold">{activityLabel(types, activity.type)}</span>
                  {activity.spokeTo && <span className="text-steel-400"> · {activity.spokeTo}</span>}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-steel-300">{activity.note}</p>
                <p className="mt-0.5 text-xs text-steel-500">
                  {formatWhen(activity.at)}
                  {activity.by?.name && ` · ${activity.by.name}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-steel-500">
          Nothing logged yet. Log each call, WhatsApp, email, visit or meeting here.
        </p>
      )}

      <Modal
        open={logging}
        title="Log a call or message"
        description={`${enquiry.number} · ${enquiry.customer?.name || ''}`}
        onClose={() => setLogging(false)}
      >
        <ActivityForm
          enquiry={enquiry}
          types={types}
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false);
            /* Read back whole: the next step and follow-up date it may have set show beside it. */
            onSaved?.();
          }}
        />
      </Modal>
    </Section>
  );
}

/**
 * One conversation, and the next step if it set one. The next step is optional: a call that
 * changed nothing is still worth writing down, and the follow-up already set stays.
 */
function ActivityForm({ enquiry, types, onClose, onSaved }) {
  const open = !CLOSED_STAGES.includes(enquiry.status);
  const [values, setValues] = useState({
    type: 'call', spokeTo: '', note: '', nextAction: '', nextFollowUpDate: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await enquiriesApi.logActivity({
        id: enquiry._id,
        type: values.type,
        note: values.note.trim(),
        spokeTo: values.spokeTo.trim() || undefined,
        nextAction: (open && values.nextAction.trim()) || undefined,
        nextFollowUpDate: (open && values.nextFollowUpDate) || undefined,
      }));
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How">
          <select className="input" value={values.type} onChange={set('type')}>
            {(types.length ? types : [{ key: 'call', label: 'Call' }]).map((type) => (
              <option key={type.key} value={type.key}>{type.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Who did you speak to?" hint="A name makes the next call easier">
          <input className="input" placeholder="Mr Ravi, purchase" value={values.spokeTo} onChange={set('spokeTo')} />
        </Field>
      </div>

      <Field label="What was said" hint="A sentence. The next person to ring reads this first" required>
        <textarea
          rows={3}
          className="input"
          autoFocus
          placeholder="Wants the price by Thursday; comparing with another supplier."
          value={values.note}
          onChange={set('note')}
        />
      </Field>

      {open && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Next step" hint="Leave blank to keep the one already set">
            <input className="input" placeholder={enquiry.nextAction || 'Send the price'} value={values.nextAction} onChange={set('nextAction')} />
          </Field>
          <Field label="Follow up on">
            <input type="date" className="input" min={inDays(0)} value={values.nextFollowUpDate} onChange={set('nextFollowUpDate')} />
          </Field>
        </div>
      )}

      <FormError error={error} />

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || values.note.trim().length < 3}>
          {busy ? 'Saving…' : 'Log it'}
        </button>
      </div>
    </form>
  );
}
