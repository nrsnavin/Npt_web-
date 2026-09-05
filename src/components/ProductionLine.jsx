import { useState } from 'react';
import { production as productionApi } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';
import { formatNumber } from '../utils/format.js';
import { HELD_PRODUCTION_STAGES, PRODUCTION_STAGES, numeric, text } from '../utils/pipeline.js';

/**
 * Recording what the plant did to one line [§14–17].
 *
 * **Two numbers are typed and the rest fall out.** Made and packed; still-to-make, percent done
 * and whether the line is late are all derived, because a figure somebody types twice is a
 * figure that ends up disagreeing with itself. The form shows what will fall out as it is
 * typed, so the person entering a count sees the consequence before saving rather than after.
 *
 * **A hold has to say why**, and the form asks for it the moment a held status is chosen rather
 * than letting the save fail. A hold with no reason is a hold nobody can clear without going and
 * asking, which is the phone call this module exists to remove.
 *
 * The one thing this form will not let you do is call a line complete while pieces are owed —
 * the server refuses it, and the button says why before you press it.
 */
export default function ProductionLineForm({ order, line, onClose, onSaved }) {
  const current = line.production || {};

  const [values, setValues] = useState({
    status: current.status || 'awaiting_planning',
    plannedQty: current.plannedQty ?? '',
    producedQty: current.producedQty ?? '',
    readyQty: current.readyQty ?? '',
    expectedCompletion: current.expectedCompletion ? current.expectedCompletion.slice(0, 10) : '',
    holdReason: current.holdReason ?? '',
    remarks: current.remarks ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  const made = Number(values.producedQty) || 0;
  const packed = Number(values.readyQty) || 0;
  const toMake = Math.max(0, line.quantity - made);
  const held = HELD_PRODUCTION_STAGES.includes(values.status);

  /*
   * The two refusals the server will make, said here first. A form that lets somebody press a
   * button it knows will fail is a form that wastes their time to be technically correct.
   */
  const packedTooHigh = packed > made;
  const completingEarly = values.status === 'completed' && toMake > 0;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await productionApi.record({
          orderId: order._id,
          lineId: line._id,
          status: values.status,
          plannedQty: numeric(values.plannedQty),
          producedQty: numeric(values.producedQty),
          readyQty: numeric(values.readyQty),
          expectedCompletion: text(values.expectedCompletion),
          holdReason: held ? values.holdReason : undefined,
          remarks: text(values.remarks),
        })
      );
      onClose();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Notice tone="info">
        {line.modelNumber || line.mould?.mouldCode} &middot; {formatNumber(line.quantity)} pieces
        ordered{line.colour ? ` in ${line.colour}` : ''}.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where it is">
          <select className="input" value={values.status} onChange={set('status')}>
            {PRODUCTION_STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>{stage.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Expected completion" hint="The date the plant is agreeing to">
          <input
            type="date"
            className="input"
            value={values.expectedCompletion}
            onChange={set('expectedCompletion')}
          />
        </Field>
      </div>

      {/*
        Asked the moment a held status is chosen, rather than after the save is refused. The
        next person to look at a stopped job should not have to go and ask why.
      */}
      {held && (
        <Field label="Why is it held?" hint="The next person to look will read this instead of ringing you">
          <input
            className="input"
            autoFocus
            placeholder="HIPS white not landed — supplier says Thursday"
            value={values.holdReason}
            onChange={set('holdReason')}
          />
        </Field>
      )}

      <div>
        <p className="eyebrow mb-2">The count</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Planned" hint="What is committed to a press">
            <input type="number" min="0" className="input" value={values.plannedQty} onChange={set('plannedQty')} />
          </Field>
          <Field label="Made" hint="Off the press, packed or not">
            <input type="number" min="0" className="input" value={values.producedQty} onChange={set('producedQty')} />
          </Field>
          <Field label="Packed" hint="Ready to go" error={packedTooHigh ? 'More than has been made' : undefined}>
            <input type="number" min="0" className="input" value={values.readyQty} onChange={set('readyQty')} />
          </Field>
        </div>

        {/*
          What falls out, shown while it is typed. The person entering a count sees the
          consequence before saving rather than discovering it on the order screen after.
        */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-line/[0.06] pt-3 text-xs">
          <span className="text-steel-400">
            Still to make{' '}
            <span className="tabular-nums font-semibold text-steel-100">{formatNumber(toMake)}</span>
          </span>
          {made > line.quantity && (
            <span className="text-steel-500">
              {formatNumber(made - line.quantity)} over &mdash; within tolerance, and nothing is owed
            </span>
          )}
        </div>
      </div>

      <Field label="Remarks">
        <input className="input" value={values.remarks} onChange={set('remarks')} />
      </Field>

      {completingEarly && (
        <Notice tone="warn">
          {formatNumber(toMake)} pieces are still to make. Record them before calling this line
          complete.
        </Notice>
      )}

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button
          type="submit"
          className="btn-primary"
          disabled={busy || packedTooHigh || completingEarly || (held && !values.holdReason.trim())}
        >
          {busy ? 'Saving…' : 'Record it'}
        </button>
      </div>
    </form>
  );
}

/** The dialog around the form, so a screen need only hold which line is open. */
export function ProductionLineDialog({ order, line, onClose, onSaved }) {
  return (
    <Modal
      open={Boolean(line)}
      title="What the plant has done"
      description={order ? `${order.number} · ${line?.modelNumber || ''}` : undefined}
      onClose={onClose}
    >
      {line && <ProductionLineForm order={order} line={line} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}
