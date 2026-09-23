import { Badge } from './ui.jsx';
import { MouldThumb } from './MouldPhoto.jsx';
import { HANGER_CATEGORIES, MATERIALS, optionLabel } from '../utils/pipeline.js';

/**
 * What was asked for, read back — every model as a peer.
 *
 * The screen half of the same change the editor made. The detail pages used to print the first
 * model as a block of labelled facts and then, underneath, a panel headed "Also asked about (2)"
 * holding a line of run-together text per model. That reads as what it was: one real item and a
 * couple of afterthoughts. It is also unusable for the job people actually do on these screens —
 * checking that what the bench is about to make matches what the buyer asked for — because the
 * second and third models were shown without their tool, without their colour rule, and without
 * the labels that say which field you are looking at.
 *
 * So each item gets the same card, in the order they were entered, numbered to match the editor
 * and the costing sheet. A record with one model shows one card, which is the ordinary case and
 * is no worse than the block it replaces.
 *
 * **The colour rule is printed in full on every item**, not abbreviated, because it is the one
 * field here that changes what the bench is allowed to do. "Preferred" and "must be this colour"
 * are three weeks apart in lead time, and the difference used to be visible on item one only.
 */

/** One labelled fact. Absent values are dropped by the caller rather than printed as a dash. */
function Fact({ label, children, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-xs font-semibold uppercase tracking-wide text-steel-500">{label}</p>
      <div className="mt-0.5 text-sm text-steel-200">{children}</div>
    </div>
  );
}

/** What the item is made on, said the way each of the three cases deserves. */
function Tool({ item, withMould }) {
  if (!withMould) return null;

  if (item.mould) {
    return (
      <Fact label="Mould" wide>
        {/* The part beside its code: what the buyer described is a shape, and this is where
            somebody can check the two agree. */}
        <span className="flex items-center gap-2.5">
          <MouldThumb mould={item.mould} />
          <span>{item.mould.mouldCode} — {item.mould.name}</span>
        </span>
      </Fact>
    );
  }

  return (
    <Fact label="Mould">
      {item.isNewDevelopment ? 'Not cut yet' : 'Bought in — no tool of ours'}
    </Fact>
  );
}

/** One model, in full. */
function Item({ item, index, count, withMould, withQuantity, bagTotal }) {
  /* The model number is the card's heading, so it is not repeated here as a fact. */
  const facts = [
    { label: 'Category', value: optionLabel(HANGER_CATEGORIES, item.category) },
    item.sizeMm && { label: 'Size', value: `${item.sizeMm} mm` },
    {
      label: 'Material',
      value: item.materialRef?.name || optionLabel(MATERIALS, item.material),
    },
    item.hookRef?.name && { label: 'Hook', value: item.hookRef.name },
    item.clipRef?.name && { label: 'Clip', value: item.clipRef.name },
    (item.printRef?.name || item.printing)
      && { label: 'Printing', value: item.printRef?.name || item.printing },
    item.packing && { label: 'Packing', value: item.packing },
  ].filter((fact) => fact && fact.value && fact.value !== '—');

  return (
    <li className="rounded-xl border border-line/[0.08] bg-line/[0.02] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        {count > 1 && (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md
              bg-flame-500/15 text-xs font-bold text-flame-400"
            aria-hidden
          >
            {index + 1}
          </span>
        )}
        <p className="text-sm font-semibold text-steel-100">
          {item.modelNumber
            || item.mould?.name
            || (count > 1 ? `Item ${index + 1}` : 'What was asked for')}
        </p>
        {item.isNewDevelopment && <Badge tone="accent">New development — no tool cut yet</Badge>}
        {withQuantity && item.quantity ? (
          <Badge tone="neutral">
            {item.quantity} pc{bagTotal && count > 1 ? ` · ${bagTotal} in the bag` : ''}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Tool item={item} withMould={withMould} />
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label} wide={fact.wide}>{fact.value}</Fact>
        ))}

        {item.colour && (
          <Fact label="Colour" wide>
            {item.colour}
            <span
              className={`mt-0.5 block text-xs ${
                item.colourMandatory ? 'font-bold text-danger-400' : 'text-steel-400'
              }`}
            >
              {item.colourMandatory
                ? 'Must be this colour — do not send another shade'
                : 'Preferred — any available colour will do'}
            </span>
          </Fact>
        )}
      </div>
    </li>
  );
}

export default function ItemList({
  items = [],
  withMould = true,
  withQuantity = false,
  bagTotal,
}) {
  if (!items.length) {
    return <p className="text-sm text-steel-500">Nothing recorded yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <Item
          key={item._id || index}
          item={item}
          index={index}
          count={items.length}
          withMould={withMould}
          withQuantity={withQuantity}
          bagTotal={bagTotal}
        />
      ))}
    </ol>
  );
}
