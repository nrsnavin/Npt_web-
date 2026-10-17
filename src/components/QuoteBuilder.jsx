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
import { rupees } from '../utils/pricing.js';
import {
  AS_MOULD, DELIVERY_TERMS, MANUFACTURE, MARKUPS, MAX_ITEMS, NONE, PAYMENT_TERMS, TRADE, blankItem, costOf, costPayload,
  isBlank, isNamed, itemFromLine, itemsFromEnquiry, lineFor, nudge, pick, problemWith, returnsOf, samePrice,
  suggestedPrice, tick, tiersOf,
} from '../utils/quoteBuilder.js';
import { GRAM_STEP } from '../utils/grams.js';
import { sayList } from '../utils/productDetails.js';

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
      {checked && children && <div className="mt-1">{children}</div>}
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

/**
 * A cost tile a person may type over. Blank shows the register's figure in grey and uses it; a
 * typed figure wins and is saved. A part not ticked into the price shows as such and takes nothing.
 */
function EditTile({ label, value, placeholder, onChange, off, step = '0.01', strong = false }) {
  return (
    <label className={`block min-w-0 rounded-lg border px-2 py-1 ${off ? 'border-line/[0.06] opacity-60' : strong ? 'border-accent/40 bg-accent/[0.06]' : 'border-line/[0.1] bg-line/[0.02]'}`}>
      <span className="block truncate text-xs text-steel-400">{label}</span>
      {off ? (
        <span className="block py-0.5 text-xs text-steel-500">not in price</span>
      ) : (
        <input
          type="number"
          min="0"
          step={step}
          className="w-full bg-transparent py-0.5 text-sm font-semibold tabular-nums text-steel-100 outline-none placeholder:font-normal placeholder:text-steel-400"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        />
      )}
    </label>
  );
}

/** One model on the quotation: what it is, what it costs, and the rate it goes out at. */
function ItemCard({ index, item, onChange, onRemove, removable, markup, seesCost, registers, parts, editing, sent, onDetailed }) {
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
  const choose = (key) => (value) => onChange(pick(item, key, value || ''));
  const toggle = (flag) => (on) => onChange(tick(item, flag, on));
  const figure = (key) => (value) => onChange({ ...item, figures: { ...item.figures, [key]: value } });
  const reg = (key, digits = 2) => (cost.register[key] ? Number(cost.register[key]).toFixed(digits) : '0.00');
  const n = index + 1;
  const priceLocked = editing && sent;
  const returns = returnsOf(item.unitPrice === '' ? suggested : item.unitPrice, cost.exactBase);

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
              disabled={priceLocked}
              onChange={(event) => onChange(pick(pick({ ...item, procurement: event.target.value }, 'mould', ''), 'tradedItem', ''))}
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
                onChange={choose('tradedItem')}
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
              <MouldSelect value={item.mould} onChange={choose('mould')} includeBlank="Search model (e.g. AC-25)" aria-label={`Model on item ${n}`} />
            </Box>
          )}
          <Box label="Material" className="col-span-2 md:col-span-3">
            <MaterialSelect value={item.materialRef} onChange={choose('materialRef')} emptyLabel="Material" aria-label={`Material on item ${n}`} />
          </Box>
          <Box label="Colour" className="md:col-span-2">
            <input className="input" value={item.colour} onChange={setFrom('colour')} placeholder="White" aria-label={`Colour on item ${n}`} />
          </Box>
          <Box label="Printing" className="md:col-span-2">
            <select className="input" value={item.printRef} onChange={(event) => choose('printRef')(event.target.value)} aria-label={`Printing on item ${n}`}>
              <option value={NONE}>No printing</option>
              <option value={AS_MOULD}>{`As the mould${seesCost && tool ? ` (${rupees(tool.printingCost || 0)})` : ''}`}</option>
              {parts.print.map((row) => (
                <option key={row._id} value={row._id}>{`${row.name}${rateOf(seesCost, row.ratePerPiece)}`}</option>
              ))}
            </select>
          </Box>
        </div>
        <div className="mt-5 flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg text-steel-400 hover:bg-line/[0.06] hover:text-steel-100 disabled:opacity-30"
            onClick={onRemove}
            disabled={!removable}
            aria-label={`Remove item ${n}`}
            title={removable ? 'Remove this item' : sent ? 'A model comes off a sent quotation through a revision' : 'A quotation needs at least one item'}
          >
            ×
          </button>
        </div>
      </div>

      {/* In the price only when ticked. */}
      <div className={`mt-2 grid grid-cols-2 gap-2 pl-7 ${seesCost ? 'md:grid-cols-4' : 'md:grid-cols-2'}`}>
        <Tick label="Hook" checked={item.withHook} onChange={toggle('withHook')}>
          <PartSelectPlain label={`Hook on item ${n}`} value={item.hookRef} onChange={choose('hookRef')} rows={parts.hook} fromMould={tool ? tool.hookCost || 0 : null} seesCost={seesCost} />
        </Tick>
        <Tick label="Clips" checked={item.withClip} onChange={toggle('withClip')}>
          <PartSelectPlain label={`Clips on item ${n}`} value={item.clipRef} onChange={choose('clipRef')} rows={parts.clip} fromMould={tool ? tool.clipsCost || 0 : null} seesCost={seesCost} />
        </Tick>
        {seesCost && <Tick label="Packing" checked={item.withPacking} onChange={toggle('withPacking')} />}
        {seesCost && <Tick label="Misc" checked={item.withMisc} onChange={toggle('withMisc')} />}
      </div>

      {seesCost && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 pl-7 sm:grid-cols-4 xl:grid-cols-11">
          {trade ? (
            <>
              <Tile label="Grammage" value="—" />
              <Tile label="Material/kg" value="—" />
              <EditTile label="Inward price" value={item.figures.inwardPrice} placeholder={reg('inwardPrice')} onChange={figure('inwardPrice')} />
            </>
          ) : (
            <>
              <EditTile label="Grammage (g)" value={item.figures.gramWeight} placeholder={cost.register.gramWeight ? String(cost.register.gramWeight) : '0'} onChange={figure('gramWeight')} step={GRAM_STEP} />
              <EditTile label="Material/kg" value={item.figures.rawMaterialRate} placeholder={reg('rawMaterialRate')} onChange={figure('rawMaterialRate')} />
              <Tile label="Material cost" value={rupees(cost.materialCost)} />
            </>
          )}
          {trade
            ? <Tile label="Job cost" value="—" />
            : <EditTile label="Job cost" value={item.figures.jobWorkCost} placeholder={reg('jobWorkCost')} onChange={figure('jobWorkCost')} />}
          <EditTile label="Packing cost" value={item.figures.packingCost} placeholder={reg('packingCost')} onChange={figure('packingCost')} off={!item.withPacking} />
          <EditTile label="Hook cost" value={item.figures.hookCost} placeholder={reg('hookCost')} onChange={figure('hookCost')} off={!item.withHook} />
          <EditTile label="Clip cost" value={item.figures.metalClipsCost} placeholder={reg('metalClipsCost')} onChange={figure('metalClipsCost')} off={!item.withClip} />
          <EditTile label="Printing cost" value={item.figures.printingCost} placeholder={reg('printingCost')} onChange={figure('printingCost')} off={item.printRef === NONE} />
          <EditTile label="Misc cost" value={item.figures.otherCost} placeholder="0.00" onChange={figure('otherCost')} off={!item.withMisc} />
          <Tile label="Base price" value={rupees(cost.base)} strong />
          <Tile label="Suggested" value={rupees(suggested)} strong />
        </div>
      )}

      {/* The product details the enquiry did not give — filled in where known; never a gate on the quote. */}
      {editing && item.missingAtOpen.length > 0 && (
        <div className="mt-2 ml-7 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line/[0.1] px-3 py-2 text-xs">
          <span className="font-semibold text-steel-100">Not given on the enquiry: {sayList(item.missingAtOpen)}</span>
          <input className="input h-8 w-56 text-xs" value={item.detailPacking} onChange={setFrom('detailPacking')} placeholder="Packing — 200 pcs per carton" aria-label={`Packing details on item ${n}`} />
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 items-end gap-2 pl-7 md:grid-cols-12">
        <Box label="Buyer's model no." className="md:col-span-2">
          <input className="input" value={item.modelNumber} onChange={setFrom('modelNumber')} disabled={priceLocked} placeholder={(trade ? traded?.modelNumber : tool?.mouldCode) || 'NPT-400S'} aria-label={`Model number on item ${n}`} />
        </Box>
        <Box label="Min. pcs" className="md:col-span-2">
          <input type="number" min="0" className="input" value={item.moq} onChange={setFrom('moq')} placeholder={(trade ? traded?.moq : tool?.moq) ? String(trade ? traded.moq : tool.moq) : ''} aria-label={`Minimum on item ${n}`} />
        </Box>
        <div className="col-span-2 md:col-span-4">
          <Box label={priceLocked ? 'Rate with the buyer — change it by a revision' : 'Final quoted rate / piece (₹)'}>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                step="0.05"
                className="input min-w-0 flex-1 font-semibold tabular-nums"
                value={item.unitPrice}
                onChange={setFrom('unitPrice')}
                disabled={priceLocked}
                placeholder={seesCost && suggested ? suggested.toFixed(2) : '—'}
                aria-label={`Final rate on item ${n}`}
              />
              {!priceLocked && [-10, -5, 5, 10].map((step) => (
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
          {seesCost && suggested != null && !priceLocked && (
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
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-7 text-xs">
          <span className="text-steel-400">{name} · {trade ? 'Trade' : hookName} · Base {rupees(cost.base)} + {markup}% = <span className="font-semibold text-steel-200">{rupees(suggested)}</span></span>
          {/* The standing tiers, side by side: choosing between them is the pricing decision. */}
          <span className="flex items-center gap-1">
            {tiersOf(cost.exactBase).map(([percent, price]) => (
              <button
                key={percent}
                type="button"
                disabled={!price || priceLocked}
                onClick={() => set('unitPrice')(price.toFixed(2))}
                className={`rounded-md border px-2 py-1 font-semibold tabular-nums disabled:opacity-40 ${samePrice(item.unitPrice, price) ? 'border-accent bg-accent/10 text-steel-50' : 'border-line/[0.15] text-steel-200 hover:border-accent/50'}`}
                title={percent === 10 ? 'The floor' : `Cost plus ${percent}%`}
              >
                {percent}%{percent === 10 ? ' floor' : ''} {price ? rupees(price) : '—'}
              </button>
            ))}
          </span>
          {returns && (
            <span className="text-steel-300">
              Markup <b className="text-steel-100">{returns.markup}%</b> · Margin <b className="text-steel-100">{returns.margin}%</b> ({rupees(returns.perPiece)}/pc)
            </span>
          )}
          {editing && (
            <label className="flex items-center gap-1.5 text-steel-300">
              Floor
              <input
                type="number"
                min="0"
                step="0.01"
                className="input h-8 w-24 text-xs tabular-nums"
                value={item.minimumOverride}
                onChange={setFrom('minimumOverride')}
                placeholder={tiersOf(cost.exactBase)[0][1] ? tiersOf(cost.exactBase)[0][1].toFixed(2) : ''}
                aria-label={`Floor override on item ${n}`}
                title="Blank means the standing floor, the 10% tier. Below the floor goes to Admin."
              />
            </label>
          )}
          {editing && item.lineId && onDetailed && (
            <button type="button" className="ml-auto font-semibold text-accent hover:underline" onClick={() => onDetailed(item.lineId)}>
              Detailed view ↗
            </button>
          )}
        </div>
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
export default function QuoteBuilder({ onClose, onSaved, onDetailed, enquiry: givenEnquiry, customer: givenCustomer, quotation: given }) {
  const { canWrite } = useAuth();
  const seesCost = canWrite('pricing');
  /* Costing or editing a saved quotation: every line in the one window, saved together. */
  const editing = Boolean(given);
  const [loaded, setLoaded] = useState(null);
  const sent = Boolean(loaded?.sentAt);

  const [customer, setCustomer] = useState(givenCustomer || '');
  /* The enquiry's buyer by name, for somebody who may quote on the enquiry but not open the customer. */
  const [customerName, setCustomerName] = useState('');
  const [enquiry, setEnquiry] = useState(givenEnquiry || '');
  const [items, setItems] = useState(() => (editing ? [] : [blankItem()]));
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
    if (editing) return undefined;
    let live = true;
    quotationsApi.numbering()
      .then((data) => live && setNextNumber(data?.current?.next || null))
      .catch(() => {});
    return () => { live = false; };
  }, [editing]);

  /* A saved quotation, read whole — its lines with their registers and costing. */
  const givenId = given?._id || given;
  useEffect(() => {
    if (!givenId) return undefined;
    let live = true;
    quotationsApi.get(givenId)
      .then((record) => {
        if (!live) return;
        setLoaded(record);
        setItems((record.lines || []).map(itemFromLine));
        setMarkup(record.lines?.[0]?.markupPercent ?? 10);
        setCustomerName(record.customer?.name || '');
        setTerms({
          paymentTerms: record.paymentTerms || '',
          deliveryTerms: record.deliveryTerms || '',
          validUntil: record.validUntil ? String(record.validUntil).slice(0, 10) : '',
          freightTerms: record.freightTerms || 'ex_factory',
          gstPercent: record.gstPercent ?? 18,
          isExport: Boolean(record.isExport),
          packing: record.packing || '',
          remarks: record.remarks || '',
        });
      })
      .catch((failure) => live && setError(failure.message));
    return () => { live = false; };
  }, [givenId]);

  /* Picking the enquiry brings its models in, unless some have been entered already. */
  useEffect(() => {
    if (!enquiry || editing) return undefined;
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

  /* The cost build-up of an item from the registers already read, for saving it. */
  const costedOf = (item) => costOf(item, {
    tool: item.procurement === TRADE ? undefined : registers.mould(item.mould),
    traded: item.procurement === TRADE ? registers.traded(item.tradedItem) : undefined,
    resin: registers.material(item.materialRef),
    hook: registers.part(item.hookRef),
    clip: registers.part(item.clipRef),
    print: registers.part(item.printRef),
  });
  const savedValidity = loaded?.validUntil ? String(loaded.validUntil).slice(0, 10) : '';
  const termsPayload = () => ({
    paymentTerms: terms.paymentTerms || undefined,
    deliveryTerms: terms.deliveryTerms || undefined,
    freightTerms: terms.freightTerms,
    packing: terms.packing || undefined,
    remarks: terms.remarks || undefined,
    /* A saved quotation's validity goes only when changed: one already past would be refused. */
    validUntil: (editing && terms.validUntil === savedValidity) ? undefined : terms.validUntil || undefined,
    isExport: terms.isExport,
    gstPercent: terms.isExport ? undefined : Number(terms.gstPercent),
  });

  /*
   * Saving a saved quotation: the terms and the list of models first (before it has gone to the
   * buyer), then each model's costing in turn — each answer carries the version the next one
   * needs, so two people costing the same quotation cannot overwrite each other unseen.
   */
  const saveExisting = async (named) => {
    let latest = loaded;
    if (!sent) {
      latest = await quotationsApi.update({
        id: latest._id,
        expectedUpdatedAt: latest.updatedAt,
        ...termsPayload(),
        lines: named.map((item) => (item.lineId
          ? {
            _id: item.lineId,
            modelNumber: item.modelNumber.trim() || undefined,
            colour: item.colour.trim() || undefined,
            moq: item.moq === '' ? undefined : Number(item.moq),
            ...(!seesCost && item.unitPrice !== '' ? { unitPrice: Number(item.unitPrice) } : {}),
          }
          : lineFor(item, { seesCost: false, printName: printNames.get(item.printRef) }))),
      });
    }
    if (seesCost) {
      const ids = (latest.lines || []).map((line) => line._id);
      for (const [at, item] of named.entries()) {
        const lineId = item.lineId || ids[at];
        if (!lineId) continue;
        latest = await quotationsApi.cost({
          id: latest._id,
          expectedUpdatedAt: latest.updatedAt,
          ...costPayload({ ...item, lineId }, { markup, costed: costedOf(item), sent, printName: printNames.get(item.printRef) }),
        });
      }
    }
    return latest;
  };

  const submit = async (event) => {
    event.preventDefault();
    const problem = problemWith({ enquiry, customer, items, editing });
    if (problem) { setError(problem); return; }
    const named = items.filter(isNamed);
    setBusy(true);
    setError(null);
    try {
      const saved = editing
        ? await saveExisting(named)
        : await quotationsApi.create({
          /* On the enquiry when there is one; on the buyer alone otherwise. */
          ...(enquiry ? { enquiry } : { customer }),
          ...termsPayload(),
          /* No named rows: the server takes the enquiry's models. */
          lines: named.length
            ? named.map((item) => lineFor(item, { markup: seesCost ? markup : undefined, seesCost, printName: printNames.get(item.printRef), costed: seesCost ? costedOf(item) : undefined }))
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

  if (editing && !loaded) {
    return <div className="flex flex-1 items-center justify-center text-sm text-steel-400">{error ? <Notice tone="danger">{error}</Notice> : 'Loading the quotation…'}</div>;
  }

  return (
    <form onSubmit={submit} className="-mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2 lg:mr-0 lg:overflow-hidden lg:pr-0">
      {/* The document — fixed at the top. */}
      <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-4">
        {editing ? (
          <>
            <Box label="Customer">
              <input className="input text-steel-300" value={customerName} readOnly aria-label="Customer" />
            </Box>
            <Box label="Enquiry">
              <input className="input text-steel-300" value={loaded.enquiry?.number || '—'} readOnly aria-label="Enquiry" />
            </Box>
          </>
        ) : (
          <>
            <Box label="Customer">
              <CustomerSelect value={customer} onChange={(next) => { setCustomer(next || ''); setEnquiry(''); setCustomerName(''); }} fallbackLabel={customerName || undefined} aria-label="Customer" />
            </Box>
            <Box label="Enquiry (optional)">
              <EnquirySelect value={enquiry || undefined} onChange={(next) => setEnquiry(next || '')} customer={customer || undefined} aria-label="Enquiry" />
            </Box>
          </>
        )}
        <Box label="Quotation number">
          <input className="input text-steel-300" value={editing ? `${loaded.number}${sent ? ' · sent' : ''}` : nextNumber ? `${nextNumber} (next)` : 'Given on save'} readOnly aria-label="Quotation number" title={editing ? undefined : "Given when saved — the next number in the year's sequence"} />
        </Box>
        <Box label="Date">
          <input className="input text-steel-300" value={formatDate(editing ? loaded.createdAt : new Date())} readOnly aria-label="Date" />
        </Box>
        <Box label="Payment terms">
          <input className="input" list="quote-payment-terms" value={terms.paymentTerms} onChange={setTerm('paymentTerms')} disabled={sent} aria-label="Payment terms" />
          <datalist id="quote-payment-terms">{PAYMENT_TERMS.map((value) => <option key={value} value={value} />)}</datalist>
        </Box>
        <Box label="Delivery terms">
          <input className="input" list="quote-delivery-terms" value={terms.deliveryTerms} onChange={setTerm('deliveryTerms')} disabled={sent} aria-label="Delivery terms" />
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
          <input type="date" className="input" min={editing && terms.validUntil === savedValidity ? undefined : inDays(0)} value={terms.validUntil} onChange={setTerm('validUntil')} disabled={sent} aria-label="Valid until" />
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
        <button type="button" className="btn-secondary h-9 px-3 text-sm" onClick={addItem} disabled={items.length >= MAX_ITEMS || sent} title={sent ? 'A model is added to a sent quotation through a revision' : undefined}>+ Add item</button>
      </div>
      <div ref={listRef} className="mt-2 space-y-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
        {items.map((item, index) => (
          <ItemCard
            key={item.key}
            index={index}
            item={item}
            onChange={updateItem(index)}
            onRemove={() => removeItem(index)}
            removable={items.length > 1 && !sent}
            markup={markup}
            seesCost={seesCost}
            registers={registers}
            parts={parts}
            editing={editing}
            sent={sent}
            onDetailed={onDetailed}
          />
        ))}
      </div>

      {/* The rest of the terms and Save — fixed at the bottom. */}
      <div className="mt-3 shrink-0 border-t border-line/[0.08] pt-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-12">
          <Box label="Freight" className="md:col-span-2">
            <select className="input" value={terms.freightTerms} onChange={setTerm('freightTerms')} disabled={sent} aria-label="Freight">
              {FREIGHT.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Box>
          <Box label="GST %" className="md:col-span-2">
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="100" className="input min-w-0 flex-1" value={terms.isExport ? '' : terms.gstPercent} onChange={setTerm('gstPercent')} disabled={terms.isExport || sent} aria-label="GST %" />
              <label className="flex shrink-0 items-center gap-1 text-xs text-steel-300">
                <input type="checkbox" checked={terms.isExport} onChange={setTerm('isExport')} disabled={sent} /> Export
              </label>
            </div>
          </Box>
          <Box label="Packing" className="md:col-span-3">
            <input className="input" value={terms.packing} onChange={setTerm('packing')} disabled={sent} placeholder="200 pcs per carton" aria-label="Packing" />
          </Box>
          <Box label="Remarks" className="col-span-2 md:col-span-5">
            <input className="input" value={terms.remarks} onChange={setTerm('remarks')} disabled={sent} placeholder="Quotation remarks (optional)" aria-label="Remarks" />
          </Box>
        </div>
        {error && <div className="mt-2"><Notice tone="danger">{error}</Notice></div>}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? (seesCost ? 'Save costing' : 'Save quotation') : 'Create quotation'}</button>
        </div>
      </div>
    </form>
  );
}
