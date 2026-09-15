/**
 * The row of figures at the top of a tracking screen, made into the filter it describes.
 *
 * Production, despatch and the chase all open with three counts — what is open, what is past
 * its date, what is stopped — and underneath them a picker offering those same three words.
 * The figure and the control were the same question asked twice, and only one of them could be
 * answered by pointing at it. Somebody reading "Past their date: 4" has already decided what
 * they want to look at; making them find the same phrase in a dropdown underneath is a step
 * that exists only because the tile was a `<div>`.
 *
 * So the tile is the control. The picker stays, because a dropdown is how you get back to a
 * choice that is not on a tile ("including finished"), and because a tile row cannot hold every
 * combination — but the common three are now one click from the number that made somebody want
 * them.
 *
 * `aria-pressed` rather than a link, because this changes what the table below shows rather
 * than going anywhere. A screen reader gets "Past their date, 4, pressed"; the eye gets a ring.
 */
export default function FilterTiles({ tiles, value, onPick, className = '' }) {
  return (
    <div className={`mb-5 grid gap-3 sm:grid-cols-3 ${className}`}>
      {tiles.map((tile) => {
        const active = value === tile.value;
        /* Lit means "this figure is not zero and somebody should look at it" — a standing
           property of the number, separate from whether it is the filter in force. */
        const lit = Boolean(tile.lit);

        return (
          <button
            key={tile.label}
            type="button"
            aria-pressed={active}
            /* A second click on the tile in force clears it, so the row is a toggle and not a
               trap: without this there is no way back to the unfiltered list from up here. */
            onClick={() => onPick(active ? tile.clear ?? '' : tile.value)}
            className={`card px-4 py-3 text-left transition-colors hover:border-accent/40 ${
              active ? 'border-accent/60 ring-1 ring-accent/50' : lit ? 'ring-1 ring-danger-500/40' : ''
            }`}
          >
            {/* Spans, not paragraphs: a `<button>` may only contain phrasing content, and a
                `<p>` inside one is invalid markup that browsers are left to guess at. */}
            <span className="eyebrow block">{tile.label}</span>
            <span className={`stat-value mt-1 block ${lit ? 'text-danger-400' : 'text-steel-50'}`}>
              {tile.figure ?? '—'}
            </span>
            <span className="mt-0.5 block text-xs text-steel-500">
              {active ? 'Showing these — click to clear' : tile.hint || 'Click to show only these'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
