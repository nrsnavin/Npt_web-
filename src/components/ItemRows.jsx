import { Field } from './ui.jsx';
import { ColourInput, MaterialSelect, PartSelect } from './pickers.jsx';
import { HANGER_CATEGORIES } from '../utils/pipeline.js';

/**
 * The other things the buyer asked about.
 *
 * A call covers shirt hangers *and* trouser hangers, and recording that as two records splits
 * one conversation into two follow-up dates, two next actions and two places to look for what
 * was said. So a lead and an enquiry carry a list, and this is how it is entered.
 *
 * **Controlled rather than registered.** Every other repeating form in this app is a fixed set
 * of fields and react-hook-form handles it well; a list somebody adds to, removes from and
 * reorders is a different problem, and `useFieldArray` for six pickers that are already
 * controlled selects would be a `Controller` each for nothing. The caller holds the array.
 *
 * **What a row does not carry, and why.** The tool, and the new-development tick: one mould is
 * named on the enquiry and it belongs to the first item — saying the buyer's second model is
 * made on the first one's mould is a fact nobody stated. The server holds the same rule, so the
 * form cannot disagree with it.
 *
 * Rows are added deliberately and removed the same way. An empty one is dropped on save rather
 * than refused: it is what somebody tabbing through a form leaves behind, and a refusal about a
 * row containing nothing sends them hunting for which of five is blank.
 */

/** A blank row. Spread rather than shared, or two rows would be the same object. */
export const blankItem = () => ({
  modelNumber: '',
  category: '',
  sizeMm: '',
  materialRef: '',
  colour: '',
  hookRef: '',
  clipRef: '',
  printRef: '',
  printing: '',
  packing: '',
});

/** Whether anybody typed anything into it — the same question the server asks before storing. */
export const filledItem = (item = {}) =>
  Boolean(
    item.modelNumber || item.category || item.sizeMm || item.materialRef || item.colour
    || item.hookRef || item.clipRef || item.printRef || item.printing || item.packing
  );

/** What goes on the wire: the rows somebody filled in, with the empty strings taken out. */
export const itemsForSave = (items = []) =>
  items.filter(filledItem).map((item) => ({
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

export default function ItemRows({
  items = [],
  onChange,
  title = 'Also asked about',
  hint = 'Other models from the same conversation. Leave empty if there was only one.',
  disabled,
}) {
  const setRow = (index, patch) =>
    onChange(items.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const add = () => onChange([...items, blankItem()]);
  const remove = (index) => onChange(items.filter((_, at) => at !== index));

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
          disabled={disabled || items.length >= MAX_ITEMS}
        >
          + Add another
        </button>
      </div>

      {items.length === 0 ? (
        <p className="py-3 text-center text-sm text-steel-500">Nothing else yet.</p>
      ) : (
        <ol className="space-y-4">
          {items.map((row, index) => (
            /*
              Keyed by position, which is normally the wrong thing to key a list on — but these
              rows have no id until they are saved, and the alternative is a generated key that
              changes on every keystroke and blurs the field somebody is typing in.
            */
            // eslint-disable-next-line react/no-array-index-key
            <li key={index} className="rounded-lg bg-line/[0.03] p-3.5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-steel-400">Item {index + 2}</p>
                <button
                  type="button"
                  className="text-xs font-semibold text-steel-500 hover:text-danger-400"
                  onClick={() => remove(index)}
                  disabled={disabled}
                >
                  Remove
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Model reference" className="sm:col-span-2">
                  <input
                    className="input"
                    placeholder="What the buyer called it"
                    value={row.modelNumber || ''}
                    disabled={disabled}
                    onChange={(event) => setRow(index, { modelNumber: event.target.value })}
                  />
                </Field>
                <Field label="Category">
                  <select
                    className="input"
                    value={row.category || ''}
                    disabled={disabled}
                    onChange={(event) => setRow(index, { category: event.target.value })}
                  >
                    <option value="">Not said</option>
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
                    value={row.sizeMm ?? ''}
                    disabled={disabled}
                    onChange={(event) => setRow(index, { sizeMm: event.target.value })}
                  />
                </Field>
                <Field label="Material" hint="From the register — brings its colour">
                  <MaterialSelect
                    value={row.materialRef}
                    onChange={(value) => setRow(index, { materialRef: value })}
                    aria-label={`Material for item ${index + 2}`}
                  />
                </Field>
                <Field label="Colour">
                  <ColourInput
                    value={row.colour}
                    onChange={(value) => setRow(index, { colour: value })}
                    list={`item-colours-${index}`}
                    aria-label={`Colour for item ${index + 2}`}
                  />
                </Field>
                <Field label="Hook">
                  <PartSelect
                    kind="hook"
                    value={row.hookRef}
                    onChange={(value) => setRow(index, { hookRef: value })}
                    aria-label={`Hook for item ${index + 2}`}
                  />
                </Field>
                <Field label="Clip">
                  <PartSelect
                    kind="clip"
                    value={row.clipRef}
                    onChange={(value) => setRow(index, { clipRef: value })}
                    aria-label={`Clip for item ${index + 2}`}
                  />
                </Field>
                <Field label="Printing">
                  <PartSelect
                    kind="print"
                    value={row.printRef}
                    onChange={(value) => setRow(index, { printRef: value })}
                    aria-label={`Printing for item ${index + 2}`}
                  />
                </Field>
                <Field label="Packing">
                  <input
                    className="input"
                    placeholder="200 pcs per carton"
                    value={row.packing || ''}
                    disabled={disabled}
                    onChange={(event) => setRow(index, { packing: event.target.value })}
                  />
                </Field>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
