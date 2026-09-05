import { useState } from 'react';
import { dispatches as dispatchApi } from '../api/endpoints.js';
import { Field, Modal, Notice } from './ui.jsx';
import { formatNumber } from '../utils/format.js';
import { numeric, text } from '../utils/pipeline.js';

/**
 * Raising a consignment [BLUEPRINT §18–19].
 *
 * The form is built around one number: **what is actually free**. Every line shows what
 * production packed, what other consignments are already holding, and the difference — and the
 * quantity box will not go past it. The server refuses an over-claim by name, and a form that
 * let somebody press a button it knows will fail is a form that wastes their time to be
 * technically correct.
 *
 * Two smaller decisions that follow from working next to a lorry rather than a desk:
 *
 * **Lines start unticked and there is no "all".** A consignment is a choice about what travels
 * together, and a form that pre-selected everything would turn that choice into an omission.
 *
 * **The paperwork is optional here.** An invoice number arrives after the request is raised and
 * an LR after the lorry is loaded. Demanding them now would mean the request is not raised until
 * everything is known, which is the afternoon after the goods could have gone. §19's gate
 * catches them at the one moment they must exist — the moment it is dispatched.
 */

/** One line of stock, with its own tick and quantity. */
function StockLine({ line, chosen, onChange }) {
  const free = line.available;
  const over = chosen.on && chosen.quantity > free;

  return (
    <li
      className={`rounded-lg border p-3 transition-colors ${
        chosen.on ? 'border-accent/40 bg-line/[0.03]' : 'border-line/[0.07]'
      }`}
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={chosen.on}
          disabled={free <= 0}
          onChange={(event) =>
            onChange({ ...chosen, on: event.target.checked, quantity: chosen.quantity || free })
          }
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-steel-100">
            {line.modelNumber || 'Unnamed model'}
            {line.colour ? <span className="text-steel-400"> · {line.colour}</span> : null}
          </span>
          {/*
            Packed, held and free on one line. The answer to "why is only 12,000 free when
            32,000 are packed" belongs next to the box somebody is about to type into.
          */}
          <span className="block text-xs text-steel-500">
            {formatNumber(line.readyQty)} packed
            {line.reserved > 0 && ` · ${formatNumber(line.reserved)} held`}
            {line.dispatched > 0 && ` · ${formatNumber(line.dispatched)} gone`}
            {' · '}
            <span className={free > 0 ? 'font-semibold text-success-400' : 'text-steel-500'}>
              {formatNumber(free)} free
            </span>
          </span>
        </span>
      </label>

      {chosen.on && (
        <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-2">
          <Field label="How many" error={over ? `Only ${formatNumber(free)} are free` : undefined}>
            <input
              type="number"
              min="1"
              max={free}
              className="input"
              value={chosen.quantity}
              onChange={(event) => onChange({ ...chosen, quantity: event.target.value })}
            />
          </Field>
          <Field label="Cartons" hint="For the delivery note">
            <input
              type="number"
              min="0"
              className="input"
              value={chosen.cartons}
              onChange={(event) => onChange({ ...chosen, cartons: event.target.value })}
            />
          </Field>
        </div>
      )}
    </li>
  );
}

export default function DispatchForm({ order, stock, onClose, onRaised }) {
  const [chosen, setChosen] = useState(() =>
    Object.fromEntries(
      stock.map((line) => [String(line.orderLine), { on: false, quantity: line.available, cartons: '' }])
    )
  );
  const [values, setValues] = useState({
    destinationName: '',
    address: '',
    city: '',
    transporter: '',
    ownVehicle: false,
    expectedDeliveryDate: '',
    remarks: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) =>
    setValues({ ...values, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });

  const picked = stock
    .map((line) => ({ line, pick: chosen[String(line.orderLine)] }))
    .filter((entry) => entry.pick?.on);

  const pieces = picked.reduce((sum, entry) => sum + (Number(entry.pick.quantity) || 0), 0);
  const overClaimed = picked.some((entry) => Number(entry.pick.quantity) > entry.line.available);
  const empty = picked.some((entry) => !(Number(entry.pick.quantity) > 0));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onRaised(
        await dispatchApi.create({
          order: order._id,
          lines: picked.map((entry) => ({
            orderLine: entry.line.orderLine,
            quantity: Number(entry.pick.quantity),
            cartons: numeric(entry.pick.cartons),
          })),
          destination: {
            name: text(values.destinationName),
            address: text(values.address),
            city: text(values.city),
          },
          ownVehicle: values.ownVehicle || undefined,
          transporter: text(values.transporter),
          expectedDeliveryDate: text(values.expectedDeliveryDate),
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

  const sendable = stock.filter((line) => line.available > 0);

  return (
    <form onSubmit={submit} className="space-y-5">
      {sendable.length === 0 ? (
        <Notice tone="info">
          Nothing on this order is free to send. Either the plant has not packed anything yet, or
          every packed piece is already on a consignment.
        </Notice>
      ) : (
        <div>
          <p className="eyebrow mb-2">What goes on the lorry</p>
          <ul className="space-y-2">
            {stock.map((line) => (
              <StockLine
                key={String(line.orderLine)}
                line={line}
                chosen={chosen[String(line.orderLine)]}
                onChange={(next) => setChosen({ ...chosen, [String(line.orderLine)]: next })}
              />
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="eyebrow mb-2">Where it is going</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {/*
            Blank means the customer's own address, which the server fills in. A buying house
            places the order and the goods go to a garment unit somewhere else, so this is asked
            rather than assumed — but only asked, never required.
          */}
          <Field label="Consignee" hint="Blank means the customer themselves">
            <input className="input" value={values.destinationName} onChange={set('destinationName')} />
          </Field>
          <Field label="Town">
            <input className="input" value={values.city} onChange={set('city')} />
          </Field>
        </div>
        <Field label="Address" className="mt-4">
          <input
            className="input"
            placeholder="14 Avinashi Road, Tiruppur 641603"
            value={values.address}
            onChange={set('address')}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Transporter" hint="Or tick below if it goes on our own lorry">
          <input
            className="input"
            disabled={values.ownVehicle}
            value={values.ownVehicle ? 'Own vehicle' : values.transporter}
            onChange={set('transporter')}
          />
        </Field>
        <Field label="Expected delivery">
          <input
            type="date"
            className="input"
            value={values.expectedDeliveryDate}
            onChange={set('expectedDeliveryDate')}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-steel-300">
        <input type="checkbox" checked={values.ownVehicle} onChange={set('ownVehicle')} />
        {/* The one exception to §19's LR gate — a local delivery has no lorry receipt. */}
        Goes on our own vehicle (no LR number)
      </label>

      <Field label="Remarks">
        <input className="input" value={values.remarks} onChange={set('remarks')} />
      </Field>

      {picked.length > 0 && (
        <p className="border-t border-line/[0.06] pt-3 text-sm text-steel-400">
          {picked.length} model{picked.length === 1 ? '' : 's'} ·{' '}
          <span className="tabular-nums font-semibold text-steel-100">{formatNumber(pieces)}</span> pieces
        </p>
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
          disabled={busy || picked.length === 0 || overClaimed || empty}
        >
          {busy ? 'Raising…' : 'Raise the consignment'}
        </button>
      </div>
    </form>
  );
}

/** The dialog around the form, so a screen need only hold whether it is open. */
export function DispatchDialog({ order, stock, open, onClose, onRaised }) {
  return (
    <Modal
      open={open}
      size="lg"
      title="Send some of this order"
      description={order ? `${order.number} · only what production has packed can go` : undefined}
      onClose={onClose}
    >
      {open && stock && (
        <DispatchForm order={order} stock={stock} onClose={onClose} onRaised={onRaised} />
      )}
    </Modal>
  );
}
