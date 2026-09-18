import { useState } from 'react';
import { dispatches as dispatchApi } from '../api/endpoints.js';
import { Facts, Field, FormError, Notice } from './ui.jsx';
import { GONE_DISPATCH_STAGES } from '../utils/pipeline.js';

/**
 * Where the lorry is going, on the consignment's own page [BLUEPRINT §19].
 *
 * §19 will not let a consignment leave without a delivery address, and until now the only place
 * one could be typed was a quick-fill box on the despatch board's blocked card. The
 * consignment's own page showed the address and offered no way to put one there — so the screen
 * that names the problem was the one screen that could not fix it.
 *
 * **"Use the customer's address" copies, it does not link.** A delivery note says where the load
 * was actually sent, and it has to keep saying that afterwards: correcting a buyer's address next
 * month must not silently rewrite where a lorry went last month. Same rule as the resin rate on
 * a costing, and for the same reason. So the button fills the boxes, a person can then change
 * any of them, and what is saved is a copy that belongs to this consignment.
 *
 * The customer's address is *offered* rather than assumed because the ordinary case is not the
 * only one: a buying house in Bengaluru places the order and the goods go to a garment unit in
 * Tiruppur, an exporter's consignment goes to a CFS. Both are ordinary, and neither is where the
 * customer is.
 */
export default function DeliveryAddress({ dispatch, customer, editable, onSaved }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(() => ({
    name: dispatch.destination?.name || '',
    address: dispatch.destination?.address || '',
    city: dispatch.destination?.city || '',
    state: dispatch.destination?.state || '',
    pincode: dispatch.destination?.pincode || '',
    contactName: dispatch.destination?.contactName || '',
    contactMobile: dispatch.destination?.contactMobile || '',
  }));

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  /* What the customer master holds, if it holds anything worth offering. */
  const onRecord = customer?.address || customer?.city || customer?.pincode ? customer : null;

  const useCustomers = () =>
    setForm((current) => ({
      ...current,
      /* The consignee name is the buyer unless somebody has already put a different one there —
         a unit name typed by hand is a deliberate answer and should survive the fill. */
      name: current.name || customer?.name || '',
      address: customer?.address || '',
      city: customer?.city || '',
      state: customer?.state || '',
      pincode: customer?.pincode || '',
    }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      /*
       * Only `destination`, and all of it. The server merges this onto what is already there, so
       * sending the whole block is what lets a field be *cleared* — a wrong pincode that cannot
       * be deleted is its own small trap.
       */
      const trimmed = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value.trim()])
      );
      await dispatchApi.update({ id: dispatch._id, destination: trimmed });
      setOpen(false);
      onSaved?.();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const missing = !dispatch.destination?.address;
  /* Already answered for, so this is not an outstanding job — see `addressOverride` on the
     model. The notice below would otherwise keep asking for something somebody has settled. */
  const answered = Boolean(dispatch.addressOverride?.reason);
  /*
   * And a consignment that has already gone is not waiting on anything.
   *
   * "This cannot be despatched" over a load that left last Tuesday is the panel arguing with
   * the badge at the top of the same page. Found by driving it: the address was cleared on a
   * consignment already on the road, and the warning came back as though the lorry were still
   * in the yard. The address is still *editable* — the record of where it went may need
   * correcting — so only the §19 warning goes away, not the button.
   */
  const gone = GONE_DISPATCH_STAGES.includes(dispatch.status);

  if (!open) {
    return (
      <>
        <dl className="space-y-3 text-sm">
          <Facts
            columns={1}
            items={[
              { label: 'Consignee', value: dispatch.destination?.name },
              { label: 'Address', value: dispatch.destination?.address },
              {
                label: 'Town',
                value: [dispatch.destination?.city, dispatch.destination?.state]
                  .filter(Boolean)
                  .join(', '),
              },
              { label: 'Pincode', value: dispatch.destination?.pincode },
              { label: 'Contact', value: dispatch.destination?.contactMobile },
            ]}
          />
        </dl>

        {/*
          Said here rather than only in the red gate notice further down the page. Somebody
          reading this panel is already looking at where the load is going; telling them the
          address is missing anywhere else is telling them in the wrong place.

          And the way past is named, second. There is usually an address and typing it is the
          right answer, so the notice says that first — but a buyer collecting at the gate has
          none to type, and a person who does not know the exception exists either leaves the
          consignment sitting or types a town nobody sent anything to.
        */}
        {missing && !answered && !gone && editable && (
          <div className="mt-3">
            <Notice tone="warn">
              <p>
                No delivery address yet, so this cannot be despatched [§19].
                {onRecord ? ' The buyer has one on record.' : ' The buyer has none on record either.'}
              </p>
              <p className="mt-1 text-xs">
                If there genuinely is none — a buyer collecting at our gate — pressing Dispatched
                will ask where it is going instead, and keep the answer against this consignment.
              </p>
            </Notice>
          </div>
        )}

        {editable && (
          <button type="button" className="btn-ghost mt-3" onClick={() => setOpen(true)}>
            {missing ? 'Enter the delivery address' : 'Change where it is going'}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Consignee" className="sm:col-span-2">
          <input className="input" value={form.name} onChange={set('name')} placeholder="Who receives it" />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <textarea rows={2} className="input" value={form.address} onChange={set('address')} />
        </Field>
        <Field label="City">
          <input className="input" value={form.city} onChange={set('city')} />
        </Field>
        <Field label="State">
          <input className="input" value={form.state} onChange={set('state')} />
        </Field>
        <Field label="Pincode">
          <input className="input" inputMode="numeric" value={form.pincode} onChange={set('pincode')} />
        </Field>
        <Field label="Contact name">
          <input className="input" value={form.contactName} onChange={set('contactName')} />
        </Field>
        <Field label="Contact mobile" className="sm:col-span-2">
          <input type="tel" className="input" value={form.contactMobile} onChange={set('contactMobile')} />
        </Field>
      </div>

      {/*
        The offer, with the address in it.

        Shown rather than hidden behind the press, because "use the customer's address" is a
        question a person can only answer if they can see what they would be getting — and on a
        buying house's order the answer is often no.
      */}
      {onRecord ? (
        <div className="rounded-lg border border-line/[0.08] bg-ink-800/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-steel-400">
            On the buyer&rsquo;s record
          </p>
          <p className="mt-1 text-sm leading-relaxed text-steel-300">
            {[customer.address, [customer.city, customer.state].filter(Boolean).join(', '), customer.pincode]
              .filter(Boolean)
              .join(' · ') || 'Nothing recorded'}
          </p>
          <button type="button" className="row-action mt-2" onClick={useCustomers}>
            Use the customer&rsquo;s address
          </button>
        </div>
      ) : (
        <Notice tone="warn">
          <p>
            {customer?.name || 'This buyer'} has no address on record, so there is nothing to copy.
            Adding one on the customer means the next consignment fills itself.
          </p>
        </Notice>
      )}

      <FormError error={error} />

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save the address'}
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
