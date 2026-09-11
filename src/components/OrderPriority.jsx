import { useState } from 'react';
import { orders as ordersApi } from '../api/endpoints.js';
import { Field, Notice, Section } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * What marketing is asking the plant to pull forward, and why [§29].
 *
 * The plant already ranks its own queue by what is late and what will miss — arithmetic it can
 * do without being told. This carries the half that never reaches the shop floor: this buyer is
 * threatening to cancel, that one is a first order, this shipment misses a vessel if it slips a
 * day. Without somewhere to say it, it gets said by phone to whoever answers, and the queue on
 * the screen and the queue actually being run quietly stop being the same queue.
 *
 * **The reason box is the feature.** Every priority field in every system decays the same way:
 * it costs nothing to set, so it gets set on everything, and then it sorts nothing. A sentence
 * somebody has to write, that a supervisor will read with their name against it, is the
 * cheapest thing that resists that — and it is also what the plant needs, since "critical"
 * tells them to move a job and not one thing about why.
 *
 * So the form is honest about the cost rather than tidy about it: each level says what it does
 * to somebody else's day, and standing a priority *down* asks for a reason too, because why it
 * stopped being urgent is exactly as much a fact about the account as why it started.
 */

const LEVELS = [
  { key: 'normal', label: 'Normal', hint: 'Runs in date order, like everything else' },
  { key: 'high', label: 'High', hint: 'Run it ahead of others due the same week' },
  {
    key: 'critical',
    label: 'Critical',
    hint: 'Goes to the top of the plant\'s list. A job already running gets pushed back.',
  },
];

const TONE = {
  normal: 'text-steel-300',
  high: 'text-warn-400',
  critical: 'text-danger-400',
};

export default function OrderPriority({ order, mayRaise, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [priority, setPriority] = useState(order.priority || 'normal');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const current = LEVELS.find((level) => level.key === (order.priority || 'normal'));
  const raised = (order.priority || 'normal') !== 'normal';

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(await ordersApi.setPriority({ id: order._id, expectedUpdatedAt: order.updatedAt, priority, reason }));
      setEditing(false);
      setReason('');
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  /* Nothing to show a reader who can neither change it nor is being told anything by it. */
  if (!mayRaise && !raised) return null;

  return (
    <Section
      title="Priority with the plant"
      actions={
        mayRaise && !editing ? (
          <button type="button" className="row-action" onClick={() => setEditing(true)}>
            {raised ? 'Change' : 'Ask for it sooner'}
          </button>
        ) : null
      }
    >
      {editing ? (
        <form onSubmit={save} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="label mb-1">How urgent, and what it costs</legend>
            {LEVELS.map((level) => (
              <label
                key={level.key}
                className="flex items-start gap-2.5 rounded-lg border border-line/[0.08] p-3 text-sm text-steel-200"
              >
                <input
                  type="radio"
                  name="priority"
                  className="mt-0.5 h-4 w-4 accent-flame-500"
                  checked={priority === level.key}
                  onChange={() => setPriority(level.key)}
                />
                <span>
                  <span className={`font-bold ${TONE[level.key]}`}>{level.label}</span>
                  <span className="mt-0.5 block text-xs text-steel-500">{level.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <Field
            label="Why"
            hint="A supervisor reads this before moving a job. Say what happens if it slips."
          >
            <textarea
              className="input min-h-[5rem]"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Buyer is holding a vessel booking for Thursday"
              aria-label="Why"
            />
          </Field>

          {error && <Notice tone="danger">{error.message}</Notice>}

          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={saving || reason.trim().length < 10}>
              {saving ? 'Saving…' : 'Tell the plant'}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setEditing(false);
                setPriority(order.priority || 'normal');
                setReason('');
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <p className={`text-base font-bold ${TONE[order.priority || 'normal']}`}>{current?.label}</p>
          <p className="text-sm text-steel-400">{current?.hint}</p>
          {raised && order.priorityReason && (
            <p className="mt-2 rounded-lg border border-line/[0.08] bg-line/[0.03] px-3 py-2 text-sm text-steel-200">
              {order.priorityReason}
            </p>
          )}
          {/* Who asked, and when. Kept visible rather than buried in the trail: it is what makes
              an over-used flag something anybody can notice. */}
          {raised && order.priorityBy?.name && (
            <p className="text-xs text-steel-500">
              {order.priorityBy.name}
              {order.priorityAt ? ` · ${formatDate(order.priorityAt)}` : ''}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
