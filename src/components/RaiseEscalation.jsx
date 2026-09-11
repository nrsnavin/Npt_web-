import { useEffect, useState } from 'react';
import { escalations as escalationsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Modal, Notice } from './ui.jsx';
import { humanise } from '../utils/format.js';

/**
 * Saying an order has stopped.
 *
 * The mirror of marketing marking an order urgent, raised from the other end. Until this existed
 * the alarm only ran one way: the plant and the yard could ask a question of one department, or
 * ring somebody, and either way the order went on looking ordinary to everybody not on the call.
 *
 * **The category is a list, not a box.** Free text cannot be counted, so "we lose two days a
 * month to tool changes" stays an opinion nobody can check. The list comes from the server
 * rather than a copy here, because a copy drifts and a drifted copy posts a value the schema
 * refuses — with a message about an invalid enum that means nothing to the person in the bay.
 *
 * **Severity is two words, not five levels.** Five get used as three, and the middle two become
 * a way of raising something without claiming it is serious. Two forces the judgement that
 * matters: has work stopped, or is this going to bite?
 *
 * **Who can clear it is optional.** The plant knowing the resin has not arrived does not mean
 * the plant knows whose job it is to chase it, and a guess forced into a required field routes
 * the alarm to the wrong screen — where it is not read, while the right screen shows nothing.
 */
export default function RaiseEscalation({ order, line, dispatch, onClose, onRaised }) {
  const { user } = useAuth();

  const [options, setOptions] = useState(null);
  const [kind, setKind] = useState('');
  const [severity, setSeverity] = useState('blocking');
  const [detail, setDetail] = useState('');
  const [needsFrom, setNeedsFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!order) return;
    escalationsApi
      .options()
      .then((loaded) => {
        setOptions(loaded);
        /*
         * Defaulted to the first category this department usually raises, so the commonest case
         * is one tap fewer. The list still shows everything — a plant person reporting a
         * paperwork problem is unusual, not wrong.
         */
        const mine = loaded.kinds.find((entry) => entry.department === user?.department);
        setKind((current) => current || mine?.key || loaded.kinds[0]?.key || '');
      })
      .catch(setError);
  }, [order, user?.department]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await escalationsApi.raise({
        orderId: order._id,
        line: line || undefined,
        dispatch: dispatch || undefined,
        kind,
        severity,
        detail: detail.trim(),
        needsFrom: needsFrom || undefined,
      });
      /* Names who was told, because that is the part nobody expects: the order's owner hears
         about it without anybody having to forward anything. */
      onRaised();
    } catch (raiseError) {
      setError(raiseError);
    } finally {
      setBusy(false);
    }
  };

  const chosen = options?.kinds.find((entry) => entry.key === kind);

  return (
    <Modal
      open={Boolean(order)}
      title="Say this order has stopped"
      description={`${order?.number || ''}${order?.customer?.name ? ` · ${order.customer.name}` : ''}`}
      onClose={onClose}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="What is wrong">
          <select className="input" value={kind} onChange={(event) => setKind(event.target.value)}>
            {(options?.kinds || []).map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.label}</option>
            ))}
          </select>
        </Field>

        {/* Radios rather than a select, because there are two and a select hides one of them
            behind a tap — on the choice that decides how the row is ranked everywhere. */}
        <fieldset>
          <legend className="label">How bad is it</legend>
          <div className="mt-1 space-y-2">
            {(options?.severities || []).map((entry) => (
              <label
                key={entry.key}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  severity === entry.key
                    ? 'border-flame-500/50 bg-flame-500/[0.06] text-steel-100'
                    : 'border-line/[0.08] text-steel-300 hover:border-line/20'
                }`}
              >
                <input
                  type="radio"
                  name="severity"
                  className="mt-0.5 h-4 w-4 accent-flame-500"
                  checked={severity === entry.key}
                  onChange={() => setSeverity(entry.key)}
                />
                <span>{entry.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          label="What is actually wrong"
          hint="Name the supplier, the tool, the missing paper — whatever the next person needs to ring about"
        >
          <textarea
            rows={3}
            className="input"
            placeholder="No white HIPS until Thursday — the drum was short-shipped"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
          />
        </Field>

        <Field
          label="Who can clear it"
          hint="Leave it blank if you do not know — everybody sees it either way"
        >
          <select
            className="input"
            value={needsFrom}
            onChange={(event) => setNeedsFrom(event.target.value)}
          >
            <option value="">Not sure</option>
            {DEPARTMENTS.map((department) => (
              <option key={department} value={department}>{humanise(department)}</option>
            ))}
          </select>
        </Field>

        {chosen?.department && chosen.department !== needsFrom && (
          <p className="text-xs text-steel-500">
            This usually lands with {humanise(chosen.department)}.
          </p>
        )}

        {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || detail.trim().length < 5}>
            {busy ? 'Raising…' : 'Escalate it'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The departments somebody can be asked to clear it.
 *
 * Listed here rather than fetched because they are the access catalogue's own keys and the
 * server checks the value anyway — a stale entry here is refused there rather than saved wrong.
 */
const DEPARTMENTS = [
  'marketing',
  'order_confirmation',
  'production',
  'quality',
  'despatch',
  'accounts',
  'management',
];
