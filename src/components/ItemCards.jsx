import { useState } from 'react';
import { Badge, Field } from './ui.jsx';
import { ColourInput, MaterialSelect, MouldSelect, PartSelect } from './pickers.jsx';
import { HANGER_CATEGORIES } from '../utils/pipeline.js';

/**
 * Everything the buyer asked about — each model entered in full, as its own item.
 *
 * **What this replaces, and why it had to go.** The list used to be "the other things mentioned
 * on the same call": item one was the record, entered through the form's own fields with the
 * whole set of options, and items two onward were compressed rows in a panel underneath called
 * "Also in the bag". That arrangement said, on every screen, that the second model was a lesser
 * thing than the first — and it was, because the reduced row could not name a tool [§28], could
 * not be marked a new development, and could not say whether its colour bound the bench. A model
 * that cannot point at the register cannot be costed against it, sampled from it, or quoted as
 * the piece the buyer approved.
 *
 * So there is no first item any more. There are items, numbered from one, each carrying the same
 * complete set of options, and the form's own fields are gone: what used to be typed at the top
 * of the page is now item 1, entered the same way as item 2.
 *
 * Three things make a long list workable, and each is doing a job rather than decorating:
 *
 *   **Collapsed once it is filled in.** Three models fully expanded is a page nobody can see the
 *   shape of. A collapsed item shows its own summary line — "NPT-380 · 380mm · White · shirt" —
 *   which is what somebody scanning for the one they need actually reads.
 *
 *   **Duplicate.** The real second model is usually the first in another size or another colour.
 *   Copying the row and changing one field is the actual data-entry job, and the alternative is
 *   re-picking the same resin, hook, clip and packing from four registers.
 *
 *   **The tool and the new-development tick are per item**, and they are the either/or they have
 *   always been: a row naming a mould is not a development, and a development has no tool yet.
 *   Ticking it clears the tool rather than letting a row claim both.
 *
 * **Controlled rather than registered.** The caller holds the array. Every other repeating form
 * here is a fixed set of fields that react-hook-form handles well; a list somebody adds to,
 * removes from and reorders is a different problem, and `useFieldArray` for eight controlled
 * pickers would be a `Controller` each for nothing.
 */

/** A blank item. Spread rather than shared, or two items would be the same object. */
export const blankItem = () => ({
  mould: '',
  isNewDevelopment: false,
  modelNumber: '',
  category: '',
  sizeMm: '',
  materialRef: '',
  colour: '',
  colourMandatory: false,
  hookRef: '',
  clipRef: '',
  printRef: '',
  printing: '',
  packing: '',
});

/**
 * Whether anybody described a model here — the same question the server asks before storing.
 *
 * A tool on its own counts. "The 380 top hanger, same as last time" is a complete answer with no
 * text in it, and a test that only looked at the typed fields would throw that item away on save
 * as though it were the blank one somebody tabbed past.
 */
export const filledItem = (item = {}) =>
  Boolean(
    item.mould || item.isNewDevelopment
    || item.modelNumber || item.category || item.sizeMm || item.materialRef || item.colour
    || item.hookRef || item.clipRef || item.printRef || item.printing || item.packing
  );

/**
 * What goes on the wire: the items somebody filled in, with the empty strings taken out.
 *
 * `withQuantity` is the sample's, and only the sample's. On a lead or an enquiry the quantity was
 * a guess at how big an order might be and is no longer asked for anywhere; on a sample it is how
 * many pieces of this model go in the courier bag, which the person raising it knows and the
 * bench has to act on. Sending it from a form that never showed the field would put a number on a
 * record nobody typed.
 *
 * `withMould` is off for a lead, and that is not an oversight: a first call names nothing on the
 * register — that is what makes it a lead — and the server's lead schema has no such field.
 */
export const itemsForSave = (items = [], { withQuantity = false, withMould = true } = {}) =>
  items.filter(filledItem).map((item) => ({
    ...(withQuantity
      ? {
        quantity: item.quantity === '' || item.quantity === undefined
          ? undefined
          : Number(item.quantity),
      }
      : {}),
    ...(withMould
      ? {
        /* Empty string is "no tool", which is a real answer — a traded item has none — and has
           to reach the server as a cleared field rather than as a row that stayed silent. */
        mould: item.mould || null,
        isNewDevelopment: Boolean(item.isNewDevelopment),
      }
      : {}),
    modelNumber: item.modelNumber || undefined,
    category: item.category || undefined,
    sizeMm: item.sizeMm === '' || item.sizeMm === undefined ? undefined : Number(item.sizeMm),
    materialRef: item.materialRef || undefined,
    colour: item.colour || undefined,
    colourMandatory: item.colourMandatory || undefined,
    hookRef: item.hookRef || undefined,
    clipRef: item.clipRef || undefined,
    printRef: item.printRef || undefined,
    printing: item.printing || undefined,
    packing: item.packing || undefined,
  }));

/** How many a list may hold, matching the server — past a dozen this is a price list. */
export const MAX_ITEMS = 12;

/** The one-line summary a collapsed item shows. What somebody scanning the list reads. */
export const summarise = (item = {}, mouldLabel) => {
  const parts = [
    item.modelNumber,
    mouldLabel,
    item.sizeMm ? `${item.sizeMm}mm` : null,
    item.colour,
    HANGER_CATEGORIES.find((option) => (option.value ?? option) === item.category)?.label,
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : 'Nothing entered yet';
};

/** One item, open or shut. */
function ItemCard({
  item, index, count, disabled, withQuantity, withMould, open, onToggle, onChange, onDuplicate,
  onRemove,
}) {
  const set = (patch) => onChange({ ...item, ...patch });

  return (
    <li className="overflow-hidden rounded-xl border border-line/[0.09] bg-line/[0.02]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-flame-500/15
              text-xs font-bold text-flame-400"
            aria-hidden
          >
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-steel-100">Item {index + 1}</span>
            {!open && (
              <span className="block truncate text-xs text-steel-500">{summarise(item)}</span>
            )}
          </span>
          {item.isNewDevelopment && <Badge tone="info">New development</Badge>}
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="text-xs font-semibold text-steel-500 hover:text-accent"
            onClick={onDuplicate}
            disabled={disabled || count >= MAX_ITEMS}
            /* The real second model is usually the first in another size. */
            title="Copy this item and change what differs"
          >
            Duplicate
          </button>
          {/* Never offered on the last one: an enquiry with no items is not an enquiry, and the
              server refuses it — better not to offer the press than to explain the refusal. */}
          {count > 1 && (
            <button
              type="button"
              className="text-xs font-semibold text-steel-500 hover:text-danger-400"
              onClick={onRemove}
              disabled={disabled}
            >
              Remove
            </button>
          )}
          <span className="text-steel-600" aria-hidden>{open ? '▾' : '▸'}</span>
        </div>
      </div>

      {open && (
        <div className="border-t border-line/[0.06] px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {withMould && (
              <>
                <Field
                  label="Model"
                  className="sm:col-span-2"
                  hint={
                    item.isNewDevelopment
                      ? 'A new development has no tool yet'
                      : 'The mould that makes it — leave empty for anything bought in'
                  }
                >
                  <MouldSelect
                    value={item.mould}
                    onChange={(value) => set({ mould: value })}
                    disabled={disabled || item.isNewDevelopment}
                    aria-label={`Model for item ${index + 1}`}
                  />
                </Field>

                <label className="flex items-start gap-2.5 text-sm text-steel-200 sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-flame-500"
                    checked={Boolean(item.isNewDevelopment)}
                    disabled={disabled}
                    /* Ticking it clears the tool. The two are an either/or — a development has
                       no steel yet — and a row claiming both is a row the register is wrong
                       about. */
                    onChange={(event) =>
                      set({
                        isNewDevelopment: event.target.checked,
                        mould: event.target.checked ? '' : item.mould,
                      })}
                    aria-label={`Item ${index + 1} is a new development`}
                  />
                  <span>
                    New development
                    <span className="mt-0.5 block text-xs text-steel-500">
                      Nothing on the register matches and nothing is bought in. Describe it
                      below; it becomes a model on the register once the tool is cut.
                    </span>
                  </span>
                </label>
              </>
            )}

            <Field
              label={item.isNewDevelopment ? 'Describe the model' : 'Model reference'}
              className="sm:col-span-2"
              hint="What the buyer asked for, in their words"
            >
              <input
                className="input"
                value={item.modelNumber || ''}
                disabled={disabled}
                onChange={(event) => set({ modelNumber: event.target.value })}
                aria-label={`Model reference for item ${index + 1}`}
              />
            </Field>

            <Field label="Category">
              <select
                className="input"
                value={item.category || ''}
                disabled={disabled}
                onChange={(event) => set({ category: event.target.value })}
                aria-label={`Category for item ${index + 1}`}
              >
                <option value="">—</option>
                {HANGER_CATEGORIES.map((option) => (
                  <option key={option.value ?? option} value={option.value ?? option}>
                    {option.label ?? option}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Size (mm)">
              <input
                type="number"
                className="input"
                value={item.sizeMm ?? ''}
                disabled={disabled}
                onChange={(event) => set({ sizeMm: event.target.value })}
                aria-label={`Size for item ${index + 1}`}
              />
            </Field>

            <Field label="Material" hint="From the register — brings its colour">
              <MaterialSelect
                value={item.materialRef}
                onChange={(value) => set({ materialRef: value })}
                aria-label={`Material for item ${index + 1}`}
              />
            </Field>

            <Field label="Colour" hint="The resin's, unless the buyer named a shade">
              <ColourInput
                value={item.colour}
                onChange={(value) => set({ colour: value })}
                list={`item-colours-${index}`}
                aria-label={`Colour for item ${index + 1}`}
              />
            </Field>

            {/*
              Beside the colour, because it is a fact about that colour and nothing else.
              Unticked is the ordinary case: most buyers asking for white want a white-ish
              hanger to look at, and a bench that waits three weeks for the exact shade has
              answered a question nobody asked. Ticked is the exception, and it is the sample
              team's licence to substitute that it withdraws.
            */}
            <label className="flex items-start gap-2.5 text-sm text-steel-200 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-flame-500"
                checked={Boolean(item.colourMandatory)}
                disabled={disabled}
                onChange={(event) => set({ colourMandatory: event.target.checked })}
                aria-label={`Item ${index + 1} colour and model must match exactly`}
              />
              <span>
                This colour and model exactly — no substitute
                <span className="mt-0.5 block text-xs text-steel-500">
                  Leave unticked and the bench may send the nearest colour it has, preferring the
                  one above.
                </span>
              </span>
            </label>

            <Field label="Hook">
              <PartSelect
                kind="hook"
                value={item.hookRef}
                onChange={(value) => set({ hookRef: value })}
                aria-label={`Hook for item ${index + 1}`}
              />
            </Field>

            <Field label="Clip">
              <PartSelect
                kind="clip"
                value={item.clipRef}
                onChange={(value) => set({ clipRef: value })}
                aria-label={`Clip for item ${index + 1}`}
              />
            </Field>

            <Field label="Printing">
              <PartSelect
                kind="print"
                value={item.printRef}
                onChange={(value) => set({ printRef: value })}
                aria-label={`Printing for item ${index + 1}`}
              />
            </Field>

            <Field label="Packing">
              <input
                className="input"
                placeholder="200 pcs per carton"
                value={item.packing || ''}
                disabled={disabled}
                onChange={(event) => set({ packing: event.target.value })}
                aria-label={`Packing for item ${index + 1}`}
              />
            </Field>

            {withQuantity && (
              <Field label="Pieces" hint="How many of this model go in the bag">
                <input
                  type="number"
                  min="1"
                  className="input"
                  value={item.quantity ?? ''}
                  disabled={disabled}
                  onChange={(event) => set({ quantity: event.target.value })}
                  aria-label={`Pieces for item ${index + 1}`}
                />
              </Field>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function ItemCards({
  items = [],
  onChange,
  title = 'What the buyer asked about',
  hint = 'One item per model. Add another for anything else from the same conversation.',
  disabled,
  /** Shows "pieces" on each item. The sample's, and only the sample's — see `itemsForSave`. */
  withQuantity = false,
  /** Off for a lead, which names nothing on the register — see `itemsForSave`. */
  withMould = true,
}) {
  /*
   * Which items are open, by position.
   *
   * Only the one being worked on, and a brand-new one is opened for you — an item added and
   * left shut is a press that appeared to do nothing. Positions rather than ids because these
   * have no id until they are saved; the set is rebuilt on add and remove so it cannot come to
   * refer to an item that has moved.
   */
  const [open, setOpen] = useState(() => new Set(items.length > 1 ? [] : [0]));

  const rows = items.length ? items : [blankItem()];
  const isOpen = (index) => open.has(index);

  const toggle = (index) => setOpen((was) => {
    const next = new Set(was);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return next;
  });

  const commit = (next, opened) => {
    onChange(next);
    if (opened !== undefined) setOpen(new Set([opened]));
  };

  const setRow = (index, value) =>
    onChange(rows.map((row, at) => (at === index ? value : row)));

  const add = () => commit([...rows, blankItem()], rows.length);

  /* The real second model is the first in another size or colour, so a copy is the entry job. */
  const duplicate = (index) => {
    const next = [...rows];
    next.splice(index + 1, 0, { ...rows[index] });
    commit(next, index + 1);
  };

  const remove = (index) => {
    const next = rows.filter((_, at) => at !== index);
    commit(next.length ? next : [blankItem()], 0);
  };

  return (
    <section className="rounded-lg border border-line/[0.08] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-steel-500">{hint}</p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={add}
          disabled={disabled || rows.length >= MAX_ITEMS}
        >
          + Add another item
        </button>
      </div>

      <ol className="space-y-3">
        {rows.map((row, index) => (
          /*
            Keyed by position, which is normally the wrong thing to key a list on — but these
            items have no id until they are saved, and the alternative is a generated key that
            changes on every keystroke and blurs the field somebody is typing in.
          */
          <ItemCard
            key={index}
            item={row}
            index={index}
            count={rows.length}
            disabled={disabled}
            withQuantity={withQuantity}
            withMould={withMould}
            open={isOpen(index)}
            onToggle={() => toggle(index)}
            onChange={(value) => setRow(index, value)}
            onDuplicate={() => duplicate(index)}
            onRemove={() => remove(index)}
          />
        ))}
      </ol>

      {rows.length >= MAX_ITEMS && (
        <p className="mt-3 text-xs text-steel-500">
          Twelve is the most one record holds — past that this is a price list rather than an
          enquiry.
        </p>
      )}
    </section>
  );
}
