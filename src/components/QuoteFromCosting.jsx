import { useEffect, useState } from 'react';
import { pricings as pricingsApi, quotations as quotationsApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { inDays } from '../utils/pipeline.js';
import { costedWith } from '../utils/pricing.js';

/* Two decimals, because a rate per piece is quoted in paise and ₹8.3 is not a price anybody
   writes. Matching the costing screens this form is opened from rather than the order screens,
   which round to the rupee. */
const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/**
 * Turning an approved costing into a quotation [§7 → §10].
 *
 * The minimum order quantity is set *here*, not on the costing. It is a term of the offer —
 * something the buyer reads beside the price and then argues about — rather than a fact about
 * what the job costs, so it belongs to the quotation and starts from the model's registered
 * standard [§28].
 *
 * **And there is no quantity beside it**, which is the whole shape of §10. A quotation from this
 * plant offers a *rate against a minimum*, not a lot: the buyer is told ₹4.90 a piece with a
 * 5,000 minimum, and the purchase order decides how many, months later. The quantity that used
 * to sit here came off the enquiry by way of the costing — a figure nobody had agreed to — and
 * then printed on a document as though somebody had.
 *
 * Nothing here is retyped — the customer, the enquiry, the model and the price come off the
 * sheet. What is left is the minimum and the terms, which belong to the conversation.
 *
 * **Or onto a quote already being written**, which is the other half of the job. A costing
 * prices one model; the document the buyer receives carries as many as they are being offered,
 * and the plant's own quotations put eight under one number. Without the choice, eight approved
 * costings produced eight quotation numbers and the person quoting had to pick between the real
 * document and the system's idea of one.
 */
export default function QuoteFromCosting({ pricing, lines, onClose, onQuoted }) {
  /*
   * What is actually going onto the document [§7].
   *
   * A sheet prices several models; only the approved ones may be offered, and only those not
   * already on a live quotation — the server takes exactly that view, so a list built any other
   * way here would show somebody a model that is not going to appear. `lines` is that list when
   * the screen already worked it out (it knows what has been quoted); the fallback is every
   * approved line, which is right wherever nothing has gone out.
   *
   * On a sheet of several, each model's rate and minimum is its own field below — "offer all
   * five at this price" is not something anybody means.
   */
  const quotable =
    lines
    || (pricing.lines || []).filter((row) => row.status === 'approved' && row.approvedSellingPrice);
  const only = quotable.length === 1 ? quotable[0] : null;
  const single = quotable.length <= 1;

  const standard = (only?.mould || pricing.mould)?.moq || 0;
  const [moq, setMoq] = useState(standard || '');
  const [unitPrice, setUnitPrice] = useState(
    (only?.approvedSellingPrice ?? pricing.approvedSellingPrice) ?? ''
  );
  /*
   * Each model's rate and minimum, on a sheet of several — prefilled from the approved price and
   * the tool's own minimum, and editable here rather than only on the quotation afterwards. A
   * rate below the floor is allowed on a draft; sending it asks for approval, as any edit does.
   */
  const [perLine, setPerLine] = useState(() =>
    Object.fromEntries(
      quotable.map((row) => [row._id, { unitPrice: row.approvedSellingPrice ?? '', moq: row.mould?.moq || '' }])
    )
  );
  const setLine = (id, field, value) =>
    setPerLine((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  const [gstPercent, setGst] = useState(18);
  const [isExport, setExport] = useState(false);
  const [paymentTerms, setPayment] = useState('');
  const [deliveryTerms, setDelivery] = useState('');
  /*
   * Defaulted rather than left blank. A quotation with no validity prints "Valid until —" on
   * the document, and §10 lists the validity among the terms the buyer reads — an offer with
   * no expiry is one the plant is still honouring two years later.
   */
  const [validUntil, setValidUntil] = useState(inDays(30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /**
   * This buyer's quotations that have not gone out yet.
   *
   * Drafts only, and that is the rule rather than a convenience: adding a model to a quote the
   * customer has already been sent changes what they were told, which §10 routes through a
   * revision. Offering a sent quote here would be offering to do the one thing the module
   * exists to prevent.
   */
  const [drafts, setDrafts] = useState([]);
  const [target, setTarget] = useState('');

  const customerId = pricing.customer?._id || pricing.customer;

  useEffect(() => {
    let cancelled = false;
    if (!customerId) return undefined;

    quotationsApi
      .list({ customer: customerId, status: 'draft', limit: 20 })
      .then((response) => {
        if (cancelled) return;
        /*
         * A draft already carrying *every* model this sheet can offer cannot take it again —
         * the server refuses that, and offering it would be inviting an error we already know
         * the answer to. One carrying some of them is still a valid target: the rest go onto
         * the same document, which is the whole point of the choice.
         */
        const offerable = (pricing.lines || [])
          .filter((row) => row.status === 'approved' && row.approvedSellingPrice)
          .map((row) => String(row._id));

        setDrafts(
          (response.data || []).filter((quote) => {
            const on = new Set(
              (quote.lines || [])
                .filter((row) => String(row.pricing?._id ?? row.pricing) === String(pricing._id))
                .map((row) => String(row.pricingLine || 'sheet'))
            );
            if (!on.size) return true;
            if (on.has('sheet')) return false;
            return offerable.some((id) => !on.has(id));
          })
        );
      })
      .catch(() => !cancelled && setDrafts([]));

    return () => {
      cancelled = true;
    };
  }, [customerId, pricing._id]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const quote = await pricingsApi.quote({
        id: pricing._id,
        /* Only where there is one model to apply them to — the server takes the same view, and
           on a sheet of several each line keeps the rate and the minimum it was priced at. */
        moq: single && moq !== '' ? Number(moq) : undefined,
        unitPrice: single && unitPrice !== '' ? Number(unitPrice) : undefined,
        ...(single
          ? {}
          : {
              lines: quotable.map((row) => ({
                pricingLine: row._id,
                unitPrice: perLine[row._id]?.unitPrice !== '' ? Number(perLine[row._id]?.unitPrice) : undefined,
                moq: perLine[row._id]?.moq !== '' ? Number(perLine[row._id]?.moq) : undefined,
              })),
            }),
        /* The terms belong to the document, so a draft keeps its own: one validity and one set
           of payment terms for every model on it, which is what makes it one offer. */
        ...(target
          ? { quotation: target }
          : {
              gstPercent: isExport ? undefined : Number(gstPercent),
              isExport,
              paymentTerms: paymentTerms || undefined,
              deliveryTerms: deliveryTerms || undefined,
              validUntil: validUntil || undefined,
            }),
      });
      onQuoted(quote);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/*
        Where this price is going. Only shown when there is somewhere for it to go — a choice
        between one option and nothing is not a choice, and an empty picker on every quote would
        make the common case read as though something were missing.
      */}
      {drafts.length > 0 && (
        <Field
          label="Put it on"
          hint="A draft for this buyer, or a document of its own"
        >
          <select
            className="input"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">A new quotation</option>
            {drafts.map((draft) => (
              <option key={draft._id} value={draft._id}>
                {draft.number} — {draft.lines?.length || 0} model
                {draft.lines?.length === 1 ? '' : 's'}
                {draft.validUntil ? ` · valid to ${formatDate(draft.validUntil)}` : ''}
              </option>
            ))}
          </select>
        </Field>
      )}

      {single ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card px-4 py-3">
              <p className="eyebrow">Approved price</p>
              <p className="stat-value mt-1 text-steel-50">
                {rupees(only?.approvedSellingPrice ?? pricing.approvedSellingPrice)}
              </p>
              <p className="mt-0.5 text-xs text-steel-500">Per piece, which is what a quote states</p>
            </div>
            <div className="card px-4 py-3">
              <p className="eyebrow">Minimum being offered</p>
              <p className="stat-value mt-1 text-steel-50">
                {moq ? formatNumber(Number(moq)) : '—'}
              </p>
              <p className="mt-0.5 text-xs text-steel-500">The smallest lot this rate holds for</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Unit price"
              hint={
                unitPrice !== '' && Number(unitPrice) < Number(only?.approvedSellingPrice ?? pricing.approvedSellingPrice)
                  ? 'Below the approved price — if it is under the floor, management must approve it before it can be sent'
                  : 'From the costing, and yours to change. The floor is checked when it is sent'
              }
            >
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Minimum order quantity"
              hint={
                standard
                  ? `The register's standard is ${formatNumber(standard)}. This buyer may be offered another`
                  : 'The smallest lot this price is offered at. Printed on the quotation'
              }
            >
              <input
                type="number"
                min="0"
                className="input"
                value={moq}
                onChange={(event) => setMoq(event.target.value)}
              />
            </Field>
          </div>
        </>
      ) : (
        /*
          Several models, each with its own rate and minimum, prefilled from what was approved
          and from its own tool. Edited model by model — one box for all of them would be one
          number standing for five different hangers.
        */
        <div className="rounded-lg border border-line/[0.06] bg-line/[0.02] px-3.5 py-3">
          <p className="eyebrow mb-2">Going on the quotation</p>
          <div className="mb-1 grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] gap-2 text-xs text-steel-500">
            <span>Model · approved</span>
            <span>Rate (₹)</span>
            <span>Minimum</span>
          </div>
          <ul className="space-y-2">
            {quotable.map((row) => {
              const rate = perLine[row._id]?.unitPrice;
              const under = rate !== '' && rate !== undefined && Number(rate) < Number(row.approvedSellingPrice);
              return (
                <li key={row._id} className="grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-center gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-steel-200">{row.modelNumber || 'Unnamed model'}</span>
                    {costedWith(row) && (
                      <span className="block truncate text-xs text-steel-400">{costedWith(row)}</span>
                    )}
                    <span className={`text-xs tabular-nums ${under ? 'text-warn-400' : 'text-steel-500'}`}>
                      {rupees(row.approvedSellingPrice)}{under ? ' · below approved' : ''}
                    </span>
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input py-1.5 tabular-nums"
                    aria-label={`Rate for ${row.modelNumber || 'this model'}`}
                    value={rate ?? ''}
                    onChange={(event) => setLine(row._id, 'unitPrice', event.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    className="input py-1.5 tabular-nums"
                    aria-label={`Minimum for ${row.modelNumber || 'this model'}`}
                    value={perLine[row._id]?.moq ?? ''}
                    onChange={(event) => setLine(row._id, 'moq', event.target.value)}
                  />
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 text-xs text-steel-500">
            Each rate starts at the price it was approved at, and each minimum at its own tool&rsquo;s.
            A rate under the floor is kept as a draft, and management must approve it before it
            can be sent.
            {(() => {
              const held = (pricing.lines?.length || 0) - quotable.length;
              if (held <= 0) return '';
              return held === 1
                ? ' One other model on this sheet is not ready to offer, and is left off.'
                : ` ${held} other models on this sheet are not ready to offer, and are left off.`;
            })()}
          </p>
        </div>
      )}

      {/*
        The terms belong to the document, not to the model — so when this price is going onto a
        quote that already exists, they are not asked for. Showing them would be asking the
        quoter to set a validity that is going to be ignored, and then leaving them to work out
        afterwards why the date they typed is not on the quotation.
      */}
      {target ? (
        <p className="rounded-lg border border-line/[0.06] bg-line/[0.02] px-3.5 py-3 text-xs text-steel-400">
          The terms, validity and GST are{' '}
          <span className="font-semibold text-steel-200">
            {drafts.find((draft) => draft._id === target)?.number}
          </span>
          &rsquo;s own — one quotation carries one set for every model on it. Only the rate and
          the minimum above belong to this model.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment terms">
              <input
                className="input"
                placeholder="30 days from invoice"
                value={paymentTerms}
                onChange={(event) => setPayment(event.target.value)}
              />
            </Field>
            <Field label="Delivery">
              <input
                className="input"
                placeholder="4 weeks from PO"
                value={deliveryTerms}
                onChange={(event) => setDelivery(event.target.value)}
              />
            </Field>
            <Field label="Valid until" hint="Printed on the quotation. Today at the earliest">
              {/*
                `min` today, because the server refuses a validity that has already passed and a
                date picker that offers last month is a picker that invites the refusal. A
                quotation raised already expired prints an offer the buyer cannot act on and
                files itself under Expired on the board it was created from.
              */}
              <input
                type="date"
                className="input"
                min={inDays(0)}
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-steel-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line/20 bg-ink-800"
                checked={isExport}
                onChange={(event) => setExport(event.target.checked)}
              />
              This is an export quote (no GST)
            </label>
            {!isExport && (
              <Field label="GST (%)" className="w-28">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="input"
                  value={gstPercent}
                  onChange={(event) => setGst(event.target.value)}
                />
              </Field>
            )}
          </div>
        </>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy
            ? 'Saving…'
            : target
              ? `Add it to ${drafts.find((draft) => draft._id === target)?.number || 'the draft'}`
              : 'Raise the quotation'}
        </button>
      </div>
    </form>
  );
}
