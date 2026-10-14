import { useEffect, useMemo, useRef, useState } from 'react';
import {
  components as componentsApi, enquiries as enquiriesApi, materials as materialsApi,
  moulds as mouldsApi, quotations as quotationsApi, tradedItems as tradedItemsApi,
} from '../api/endpoints.js';
import Combobox from './Combobox.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Notice } from './ui.jsx';
import { CustomerSelect, EnquirySelect, MaterialSelect, MouldSelect } from './pickers.jsx';
import { inDays } from '../utils/pipeline.js';
import { formatDate } from '../utils/format.js';
import { formatGrams } from '../utils/grams.js';
import { rupees } from '../utils/pricing.js';
import {
  AS_MOULD, DELIVERY_TERMS, MANUFACTURE, MARKUPS, MAX_ITEMS, NONE, PAYMENT_TERMS, TRADE, blankItem, costOf, isBlank,
  isNamed, itemsFromEnquiry, lineFor, nudge, problemWith, samePrice, suggestedPrice,
} from '../utils/quoteBuilder.js';

const FREIGHT = [
  { value: 'ex_factory', label: 'Ex-factory' },
  { value: 'fob', label: 'FOB' },
  { value: 'cif', label: 'CIF' },
  { value: 'door_delivery', label: 'Door delivery' },
];

/** The trading master, for a trade hanger's picker. */
const loadTradedItems = (term) => tradedItemsApi.list({ search: term || undefined, isActive: true, limit: 20 });

/** A small label over a control — the form's own, tighter than `Field`, so it fits one window. */
function Box({ label, className = '', children }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-steel-300">{label}</span>
      {children}
    </label>
  );
}

/** One figure of the cost build-up. */
function Tile({ label, value, strong = false }) {
  return (
    <div className={`min-w-0 rounded-lg border px-2.5 py-1.5 ${strong ? 'border-accent/40 bg-accent/[0.06]' : 'border-line/[0.1] bg-line/[0.02]'}`}>
      <p className="truncate text-xs text-steel-400">{label}</p>
      <p className={`truncate text-sm tabular-nums ${strong ? 'font-bold text-steel-50' : 'font-semibold text-steel-100'}`}>{value}</p>
    </div>
  );
}

/**
 * Register records by id, fetched once a session and shared by every item: ten items on one
 * mould ask for it once.
 */
function useRegister(fetchOne) {
  const cache = useRef(new Map());
  const [, redraw] = useState(0);
  const get = (id) => {
    if (!id || id === NONE) return undefined;
    if (!cache.current.has(id)) {
      cache.current.set(id, null);
      fetchOne(id)
        .then((row) => { cache.current.set(id, row); redraw((n) => n + 1); })
        .catch(() => {});
    }
    return cache.current.get(id) || undefined;
  };
  return get;
}

/** A whole part register for a plain select — "As the mould" and "Not required" need to be options. */
function usePartList(kind) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    componentsApi.list({ kind, isActive: 'true', limit: 200 })
      .then((found) => live && setRows(Array.isArray(found) ? found : found?.data || []))
      .catch(() => {});
    return () => { live = false; };
  }, [kind]);
  return rows;
}

/** What was quoted before for this mould in this resin — same hook and clips first. */
function PreviousPrice({ mould, material, hook, clip }) {
  const [found, setFound] = useState(null);
  const ref = (value) => (value && value !== NONE ? value : undefined);
  useEffect(() => {
    if (!mould || !material) { setFound(null); return undefined; }
    let live = true;
    setFound(undefined);
    quotationsApi.previous({ mould, material, hook: ref(hook), clip: ref(clip) })
      .then((data) => live && setFound(data))
      .catch(() => live && setFound({ same: [], similar: [] }));
    return () => { live = false; };
  }, [mould, material, hook, clip]);

  const last = found?.same?.[0];
  const near = found?.similar?.[0];
  return (
    <div className="min-w-0 rounded-lg border border-accent/30 bg-accent/[0.05] px-3 py-1.5 text-xs" aria-live="polite">
      {!mould || !material ? (
        <p className="text-steel-400">Pick model and material to see earlier quotes</p>
      ) : found === undefined ? (
        <p className="text-steel-400">Looking up earlier quotes…</p>
      ) : last ? (
        <p className="text-steel-200">
          <span className="font-semibold text-steel-50">Last quoted {rupees(last.price)}</span>
          {` · ${last.number}${last.customer ? ` · ${last.customer}` : ''} · ${formatDate(last.at)}`}
        </p>
      ) : (
        <p className="text-steel-200">
          <span className="font-semibold text-steel-50">No previous exact-match quotation</span>
          {near ? ` · other parts: ${rupees(near.price)} (${near.number})` : ''}
        </p>
      )}
    </div>
  );
}

/** A register rate in an option, for those who may see costs [§8]; nothing for anybody else. */
const rateOf = (seesCost, value) => (seesCost && value != null ? ` — ${rupees(value)}` : '');

/**
 * A part that is in the price only when ticked: hook, clips, packing, misc. The tick says the piece
 * has it; unticked, its cost is left out of the price whatever the mould is set up with.
 */
function Tick({ label, checked, onChange, children }) {
  return (
    <div className={`min-w-0 rounded-lg border px-2 py-1.5 ${checked ? 'border-accent/40 bg-accent/[0.04]' : 'border-line/[0.1]'}`}>
      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-steel-200">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        {label}
        {!checked && <span className="font-normal text-steel-500">· not in price</span>}
      </label>
      {checked && <div className="mt-1">{children}</div>}
    </div>
  );
}

function PartSelectPlain({ label, value, onChange, rows, fromMould, seesCost }) {
  return (
    <select className="input h-9" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
      <option value={AS_MOULD}>{`As the mould${seesCost && fromMould != null ? ` (${rupees(fromMould)})` : ''}`}</option>
      {rows.map((row) => (
        <option key={row._id} value={row._id}>{`${row.name}${row.colour ? ` · ${row.colour}` : ''}${rateOf(seesCost, row.ratePerPiece)}`}</option>
      ))}
    </select>
  );
}

/** One model on the quotation: what it is, what it costs, and the rate it goes out at. */
function ItemCard({ index, item, onChange, onRemove, removable, markup, seesCost, registers, parts }) {
  const trade = item.procurement === TRADE;
  const tool = trade ? undefined : registers.mould(item.mould);
  const traded = trade ? registers.traded(item.tradedItem) : undefined;
  const resin = registers.material(item.materialRef);
  const hook = registers.part(item.hookRef);
  const clip = registers.part(item.clipRef);
  const print = registers.part(item.printRef);
  const cost = costOf(item, { tool, resin, hook, clip, print, traded });
  const suggested = suggestedPrice(cost.exactBase, markup);
  const set = (key) => (value) => onChange({ ...item, [key]: value });
  const setFrom = (key) => (event) => set(key)(event.target.value);
  const n = index + 1;

  const hookName = !item.withHook ? 'No hook' : hook?.name || 'Mould hook';
  const name = (trade ? traded?.modelNumber : tool?.mouldCode) || item.modelNumber || `Item ${n}`;

  return (
    <div className="rounded-xl border border-line/[0.1] bg-line/[0.015] p-3">
      <div className="flex items-start gap-2">
        <span className="mt-6 w-5 shrink-0 text-xs font-bold text-steel-400">{n}</span>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 md:grid-cols-12">
          <Box label="Type" className="md:col-span-2">
            <select
              className="input"
              value={item.procurement}
              onChange={(event) => onChange({ ...item, procurement: event.target.value, mould: '', tradedItem: '' })}
              aria-label={`Made here or trade on item ${n}`}
            >
              <option value={MANUFACTURE}>Made here</option>
              <option value={TRADE}>Trade (bought in)</option>
            </select>
          </Box>
          {trade ? (
            <Box label="Trade hanger" className="col-span-2 md:col-span-3">
              <Combobox
                value={item.tradedItem}
                onChange={(value) => set('tradedItem')(value || '')}
                loadOptions={loadTradedItems}
                loadOne={tradedItemsApi.get}
                toOption={(row) => ({
                  value: row._id,
                  label: `${row.modelNumber}${seesCost && row.inwardPrice != null ? ` — ₹${row.inwardPrice}` : ''}`,
                  hint: [row.colour, row.supplier].filter(Boolean).join(' · '),
                })}
                placeholder="Search the trading master…"
                emptyLabel="Pick the bought-in model"
                noMatchLabel="Not on the trading master"
                aria-label={`Trade hanger on item ${n}`}
              />
            </Box>
          ) : (
            <Box label="Model" className="col-span-2 md:col-span-3">
              <MouldSelect value={item.mould} onChange={(value) => onChange({ ...item, mould: value || '' })} includeBlank="Search model (e.g. AC-25)" aria-label={`Model on item ${n}`} />
            </Box>
          )}
          <Box label="Material" className="col-span-2 md:col-span-3">
            <MaterialSelect value={item.materialRef} onChange={(value) => set('materialRef')(value || '')} emptyLabel="Material" aria-label={`Material on item ${n}`} />
          </Box>
          <Box label="Colour" className="md:col-span-2">
            <input className="input" value={item.colour} onChange={setFrom('colour')} placeholder="White" aria-label={`Colour on item ${n}`} />
          </Box>
          <Box label="Printing" className="md:col-span-2">
            <select className="input" value={item.printRef} onChange={setFrom('printRef')} aria-label={`Printing on item ${n}`}>
              <option value={NONE}>No printing</option>
              <option value={AS_MOULD}>{`As the mould${seesCost && tool ? ` (${rupees(tool.printingCost || 0)})` : ''}`}</option>
              {parts.print.map((row) => (
                <option key={row._id} value={row._id}>{`${row.name}${rateOf(seesCost, row.ratePerPiece)}`}</option>
              ))}
            </select>
          </Box>
        </div>
        <button
          type="button"
          className="mt-5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-steel-400 hover:bg-line/[0.06] hover:text-steel-100 disabled:opacity-30"
          onClick={onRemove}
          disabled={!removable}
          aria-label={`Remove item ${n}`}
          title={removable ? 'Remove this item' : 'A quotation needs at least one item'}
        >
          ×
        </button>
      </div>

      {/* In the price only when ticked. */}
      <div className="mt-2 grid grid-cols-2 gap-2 pl-7 md:grid-cols-4">
        <Tick label="Hook" checked={item.withHook} onChange={set('withHook')}>
          <PartSelectPlain label={`Hook on item ${n}`} value={item.hookRef} onChange={set('hookRef')} rows={parts.hook} fromMould={tool ? tool.hookCost || 0 : null} seesCost={seesCost} />
        </Tick>
        <Tick label="Clips" checked={item.withClip} onChange={set('withClip')}>
          <PartSelectPlain label={`Clips on item ${n}`} value={item.clipRef} onChange={set('clipRef')} rows={parts.clip} fromMould={tool ? tool.clipsCost || 0 : null} seesCost={seesCost} />
        </Tick>
        <Tick label="Packing" checked={item.withPacking} onChange={set('withPacking')}>
          {seesCost ? (
            <input type="number" min="0" step="0.01" className="input h-9 tabular-nums" value={item.packing} onChange={setFrom('packing')} placeholder={tool?.packingCost != null ? `₹${Number(tool.packingCost).toFixed(2)} (mould)` : '₹ per piece'} aria-label={`Packing cost on item ${n}`} />
          ) : <p className="text-xs text-steel-400">Included</p>}
        </Tick>
        <Tick label="Misc" checked={item.withMisc} onChange={set('withMisc')}>
          {seesCost ? (
            <input type="number" min="0" step="0.01" className="input h-9 tabular-nums" value={item.misc} onChange={setFrom('misc')} placeholder="₹ per piece" aria-label={`Misc cost on item ${n}`} />
          ) : <p className="text-xs text-steel-400">Included</p>}
        </Tick>
      </div>

      {seesCost && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 pl-7 sm:grid-cols-4 xl:grid-cols-11">
          <Tile label="Grammage" value={trade ? '—' : formatGrams(cost.gramWeight)} />
          <Tile label="Material/kg" value={trade ? '—' : rupees(cost.ratePerKg)} />
          {trade
            ? <Tile label="Inward price" value={rupees(cost.inwardPrice)} />
            : <Tile label="Material cost" value={rupees(cost.materialCost)} />}
          <Tile label="Job cost" value={rupees(cost.jobCost)} />
          <Tile label="Packing cost" value={rupees(cost.packingCost)} />
          <Tile label="Hook cost" value={rupees(cost.hookCost)} />
          <Tile label="Clip cost" value={rupees(cost.clipCost)} />
          <Tile label="Printing cost" value={rupees(cost.printingCost)} />
          <Tile label="Misc cost" value={rupees(cost.miscCost)} />
          <Tile label="Base price" value={rupees(cost.base)} strong />
          <Tile label="Suggested" value={rupees(suggested)} strong />
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 items-end gap-2 pl-7 md:grid-cols-12">
        <Box label="Buyer's model no." className="md:col-span-2">
          <input className="input" value={item.modelNumber} onChange={setFrom('modelNumber')} placeholder={(trade ? traded?.modelNumber : tool?.mouldCode) || 'NPT-400S'} aria-label={`Model number on item ${n}`} />
        </Box>
        <Box label="Min. pcs" className="md:col-span-2">
          <input type="number" min="0" className="input" value={item.moq} onChange={setFrom('moq')} placeholder={(trade ? traded?.moq : tool?.moq) ? String(trade ? traded.moq : tool.moq) : ''} aria-label={`Minimum on item ${n}`} />
        </Box>
        <div className="col-span-2 md:col-span-4">
          <Box label="Final quoted rate / piece (₹)">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                step="0.05"
                className="input min-w-0 flex-1 font-semibold tabular-nums"
                value={item.unitPrice}
                onChange={setFrom('unitPrice')}
                placeholder={seesCost && suggested ? suggested.toFixed(2) : '—'}
                aria-label={`Final rate on item ${n}`}
              />
              {[-10, -5, 5, 10].map((step) => (
                <button
                  key={step}
                  type="button"
                  className="h-9 shrink-0 rounded-md border border-line/[0.15] px-1.5 text-xs font-semibold text-steel-200 hover:border-accent/50 hover:text-steel-50"
                  onClick={() => set('unitPrice')(nudge(item.unitPrice === '' ? suggested || 0 : item.unitPrice, step))}
                  aria-label={`${step > 0 ? 'Add' : 'Take off'} ${Math.abs(step)} paise on item ${n}`}
                >
                  {step > 0 ? `+${step}p` : `${step}p`}
                </button>
              ))}
            </div>
          </Box>
        </div>
        <div className="col-span-2 flex items-end gap-2 md:col-span-4">
          <div className="min-w-0 flex-1">
            {trade
              ? <p className="rounded-lg border border-line/[0.1] px-3 py-1.5 text-xs text-steel-400">Trade hanger — costed at the supplier’s inward price, no material added.</p>
              : <PreviousPrice mould={item.mould} material={item.materialRef} hook={item.withHook ? item.hookRef : NONE} clip={item.withClip ? item.clipRef : NONE} />}
          </div>
          {seesCost && suggested != null && (
            <button
              type="button"
              className="btn-secondary h-9 shrink-0 whitespace-nowrap px-3 text-xs"
              onClick={() => set('unitPrice')(suggested.toFixed(2))}
              disabled={samePrice(item.unitPrice, suggested)}
            >
              Use {rupees(suggested)}
            </button>
          )}
        </div>
      </div>

      {seesCost && (
        <p className="mt-1.5 pl-7 text-xs text-steel-400">
          {name} · {trade ? 'Trade' : hookName} · Base {rupees(cost.base)} + {markup}% = <span className="font-semibold text-steel-200">{rupees(suggested)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The new-quotation form in one window [Quotations → New quotation]: the document's terms at the
 * top, the models in the middle — each with its costing worked out as it is picked — and the
 * remaining terms and Save at the bottom. Only the list of models scrolls.
 *
 * Marketing sees the same form without the cost: the tiles, the base and the suggested price
 * are the Quotation department's and Admin's [§8]. A rate left blank goes to the Quotation
 * department to price, as before.
 */
export default function QuoteBuilder({ onClose, onSaved, enquiry: givenEnquiry, customer: givenCustomer }) {
  const { canWrite } = useAuth();
  const seesCost = canWrite('pricing');

  const [customer, setCustomer] = useState(givenCustomer || '');
  /* The enquiry's buyer by name, for somebody who may quote on the enquiry but not open the customer. */
  const [customerName, setCustomerName] = useState('');
  const [enquiry, setEnquiry] = useState(givenEnquiry || '');
  const [items, setItems] = useState([blankItem()]);
  const [markup, setMarkup] = useState(10);
  const [terms, setTerms] = useState({
    paymentTerms: '100% Advance',
    deliveryTerms: 'Ex-factory',
    validUntil: inDays(30),
    freightTerms: 'ex_factory',
    gstPercent: 18,
    isExport: false,
    packing: '',
    remarks: '',
  });
  const [nextNumber, setNextNumber] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const registers = {
    mould: useRegister(mouldsApi.get),
    material: useRegister(materialsApi.get),
    part: useRegister(componentsApi.get),
    traded: useRegister(tradedItemsApi.get),
  };
  const parts = { hook: usePartList('hook'), clip: usePartList('clip'), print: usePartList('print') };
  const printNames = useMemo(() => new Map(parts.print.map((row) => [row._id, row.name])), [parts.print]);

  useEffect(() => {
    let live = true;
    quotationsApi.numbering()
      .then((data) => live && setNextNumber(data?.current?.next || null))
      .catch(() => {});
    return () => { live = false; };
  }, []);

  /* Picking the enquiry brings its models in, unless some have been entered already. */
  useEffect(() => {
    if (!enquiry) return undefined;
    let live = true;
    enquiriesApi.get(enquiry)
      .then((found) => {
        if (!live) return;
        const record = found?.enquiry || found;
        const buyer = record?.customer?._id || record?.customer;
        if (buyer && !customer) setCustomer(buyer);
        setCustomerName(record?.customer?.name || '');
        const fromEnquiry = itemsFromEnquiry(record);
        if (fromEnquiry.length) setItems((current) => (current.every(isBlank) ? fromEnquiry : current));
      })
      .catch(() => {});
    return () => { live = false; };
    /* The customer is only filled when empty; re-running on it would re-read the enquiry. */
  }, [enquiry]);

  const setTerm = (key) => (event) =>
    setTerms({ ...terms, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });
  const updateItem = (index) => (next) => setItems(items.map((item, at) => (at === index ? next : item)));
  const removeItem = (index) => setItems(items.length === 1 ? items : items.filter((unused, at) => at !== index));
  const listRef = useRef(null);
  const addItem = () => {
    if (items.length >= MAX_ITEMS) return;
    setItems([...items, blankItem()]);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const problem = problemWith({ enquiry, items });
    if (problem) { setError(problem); return; }
    const named = items.filter(isNamed);
    setBusy(true);
    setError(null);
    try {
      const saved = await quotationsApi.create({
        enquiry,
        paymentTerms: terms.paymentTerms || undefined,
        deliveryTerms: terms.deliveryTerms || undefined,
        freightTerms: terms.freightTerms,
        packing: terms.packing || undefined,
        remarks: terms.remarks || undefined,
        validUntil: terms.validUntil || undefined,
        isExport: terms.isExport,
        gstPercent: terms.isExport ? undefined : Number(terms.gstPercent),
        /* No named rows: the server takes the enquiry's models. */
        lines: named.length
          ? named.map((item) => lineFor(item, { markup: seesCost ? markup : undefined, seesCost, printName: printNames.get(item.printRef) }))
          : undefined,
      });
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="-mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2 lg:mr-0 lg:overflow-hidden lg:pr-0">
      {/* The document — fixed at the top. */}
      <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-4">
        <Box label="Customer">
          <CustomerSelect value={customer} onChange={(next) => { setCustomer(next || ''); setEnquiry(''); setCustomerName(''); }} fallbackLabel={customerName || undefined} aria-label="Customer" />
        </Box>
        <Box label="Enquiry *">
          <EnquirySelect value={enquiry || undefined} onChange={(next) => setEnquiry(next || '')} customer={customer || undefined} aria-label="Enquiry" />
        </Box>
        <Box label="Quotation number">
          <input className="input text-steel-300" value={nextNumber ? `${nextNumber} (next)` : 'Given on save'} readOnly aria-label="Quotation number" title="Given when saved — the next number in the year's sequence" />
        </Box>
        <Box label="Date">
          <input className="input text-steel-300" value={formatDate(new Date())} readOnly aria-label="Date" />
        </Box>
        <Box label="Payment terms">
          <input className="input" list="quote-payment-terms" value={terms.paymentTerms} onChange={setTerm('paymentTerms')} aria-label="Payment terms" />
          <datalist id="quote-payment-terms">{PAYMENT_TERMS.map((value) => <option key={value} value={value} />)}</datalist>
        </Box>
        <Box label="Delivery terms">
          <input className="input" list="quote-delivery-terms" value={terms.deliveryTerms} onChange={setTerm('deliveryTerms')} aria-label="Delivery terms" />
          <datalist id="quote-delivery-terms">{DELIVERY_TERMS.map((value) => <option key={value} value={value} />)}</datalist>
        </Box>
        {seesCost && (
          <Box label="Margin / Mark-up">
            <select className="input" value={markup} onChange={(event) => setMarkup(Number(event.target.value))} aria-label="Margin / Mark-up">
              {MARKUPS.map((value) => <option key={value} value={value}>{value}%{value === 10 ? ' (minimum)' : ''}</option>)}
            </select>
          </Box>
        )}
        <Box label="Valid until" className={seesCost ? '' : 'lg:col-span-2'}>
          <input type="date" className="input" min={inDays(0)} value={terms.validUntil} onChange={setTerm('validUntil')} aria-label="Valid until" />
        </Box>
      </div>

      {/* The models — the only part that scrolls. */}
      <div className="mt-3 flex shrink-0 items-center justify-between gap-3">
        <p className="text-sm font-bold text-steel-100">
          Quotation items <span className="font-normal text-steel-400">· {items.length} of {MAX_ITEMS}</span>
          <span className="ml-2 hidden text-xs font-normal text-steel-400 md:inline">
            {seesCost ? 'Costing is internal — the customer PDF shows model, material, photo and rate only.' : 'A blank rate goes to the Quotation department to price.'}
          </span>
        </p>
        <button type="button" className="btn-secondary h-9 px-3 text-sm" onClick={addItem} disabled={items.length >= MAX_ITEMS}>+ Add item</button>
      </div>
      <div ref={listRef} className="mt-2 space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
        {items.map((item, index) => (
          <ItemCard
            key={item.key}
            index={index}
            item={item}
            onChange={updateItem(index)}
            onRemove={() => removeItem(index)}
            removable={items.length > 1}
            markup={markup}
            seesCost={seesCost}
            registers={registers}
            parts={parts}
          />
        ))}
      </div>

      {/* The rest of the terms and Save — fixed at the bottom. */}
      <div className="mt-3 shrink-0 border-t border-line/[0.08] pt-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-12">
          <Box label="Freight" className="md:col-span-2">
            <select className="input" value={terms.freightTerms} onChange={setTerm('freightTerms')} aria-label="Freight">
              {FREIGHT.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Box>
          <Box label="GST %" className="md:col-span-2">
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="100" className="input min-w-0 flex-1" value={terms.isExport ? '' : terms.gstPercent} onChange={setTerm('gstPercent')} disabled={terms.isExport} aria-label="GST %" />
              <label className="flex shrink-0 items-center gap-1 text-xs text-steel-300">
                <input type="checkbox" checked={terms.isExport} onChange={setTerm('isExport')} /> Export
              </label>
            </div>
          </Box>
          <Box label="Packing" className="md:col-span-3">
            <input className="input" value={terms.packing} onChange={setTerm('packing')} placeholder="200 pcs per carton" aria-label="Packing" />
          </Box>
          <Box label="Remarks" className="col-span-2 md:col-span-5">
            <input className="input" value={terms.remarks} onChange={setTerm('remarks')} placeholder="Quotation remarks (optional)" aria-label="Remarks" />
          </Box>
        </div>
        {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Create quotation'}</button>
        </div>
      </div>
    </form>
  );
}
