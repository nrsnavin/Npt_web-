import { useState } from 'react';
import { BOUNDS, INDIA_OUTLINE, SQUEEZE } from '../data/indiaOutline.js';
import { formatNumber } from '../utils/format.js';

/**
 * Where the business actually is.
 *
 * "Where they are" was a sorted list of towns, which answers exactly one question — which town
 * has the most — and hides the ones somebody came for. Is this a Tiruppur business with a few
 * outliers, or is it spread across four states? Is there a cluster in Gujarat nobody has been
 * to since March? Is the whole of the north one customer? A sorted list cannot show any of
 * those, because sorting is precisely the act of throwing away where the places are.
 *
 * The list stays beside the map rather than being replaced by it. A map is very good at shape
 * and very bad at value: nobody reads eleven off a circle. Together they answer both questions;
 * either alone answers half.
 *
 * **Three channels, and no more.** Size is how many. Colour is whether anything there has gone
 * quiet — the one status worth interrupting the eye for. A dashed edge means the town was not
 * recognised and the mark sits in the middle of its state, which is a guess and is drawn as
 * one. A fourth channel would make this a puzzle rather than a picture.
 *
 * **Area, not radius.** A place with four times the leads gets a circle of four times the
 * *area*, which is what the eye actually compares. Scaling the radius instead is the commonest
 * chart lie there is — it draws that place sixteen times as large.
 */

/** The frame. Longitude squeezed by the cosine of the middle latitude — see the data file. */
const WIDTH = 1000;
const SCALE = WIDTH / ((BOUNDS.east - BOUNDS.west) * SQUEEZE);
const HEIGHT = (BOUNDS.north - BOUNDS.south) * SCALE;

const project = (lat, lng) => [
  (lng - BOUNDS.west) * SQUEEZE * SCALE,
  (BOUNDS.north - lat) * SCALE,
];

const OUTLINE = `${INDIA_OUTLINE.map(([lng, lat], index) => {
  const [x, y] = project(lat, lng);
  return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
}).join('')}Z`;

/** Big enough to hit with a finger at the smallest, small enough not to swallow its neighbours. */
const MIN_RADIUS = 10;
const MAX_RADIUS = 40;

const radiusFor = (value, largest) =>
  MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(value / Math.max(largest, 1));

/**
 * A place's identity, which is not its name.
 *
 * Delhi is a city and Delhi is a state, and a book with leads in both draws two marks with one
 * label. Keyed on the label alone, hovering one of them showed the other's figures — a tooltip
 * confidently describing the wrong place, which is the worst kind of wrong a map can be.
 */
const idOf = (place) => `${place.precision}:${place.label}`;

/**
 * Which marks get their name written beside them.
 *
 * Not the top five: the top five of this business are Tiruppur, Coimbatore and Erode, which are
 * fifty kilometres apart and printed one on top of another — three names in the same place,
 * none of them readable. So it is greedy by size, and a name is only written where it does not
 * land on one already written. The ones that lose out are in the list beside the map, spelled
 * out, which is where somebody reads a name off anyway.
 */
function labelled(places, largest) {
  const placed = [];

  for (const place of places) {
    const [x, y] = project(place.lat, place.lng);
    const top = y - radiusFor(place.total, largest) - 8;
    // Rough, and rough is enough: it decides whether to write a word, not where a dot goes.
    const halfWidth = place.label.length * 6 + 6;
    const box = { left: x - halfWidth, right: x + halfWidth, top: top - 22, bottom: top + 4 };

    const clashes = placed.some(
      (other) =>
        box.left < other.box.right &&
        box.right > other.box.left &&
        box.top < other.box.bottom &&
        box.bottom > other.box.top
    );

    if (!clashes) placed.push({ place, x, y: top, box });
    if (placed.length >= 7) break;
  }

  return placed;
}

function Tooltip({ place }) {
  const [x, y] = project(place.lat, place.lng);
  // A card that hangs above a mark near the top edge hangs off the map. Ludhiana and Srinagar
  // are real places with real leads, so it flips under them rather than being cut in half.
  const below = y / HEIGHT < 0.22;

  return (
    <div
      className={`pointer-events-none absolute z-10 w-max max-w-[15rem] -translate-x-1/2 rounded-lg border border-line/[0.1] bg-ink-800 px-3 py-2 shadow-float ${
        below ? '' : '-translate-y-full'
      }`}
      style={{
        left: `${(x / WIDTH) * 100}%`,
        top: `calc(${(y / HEIGHT) * 100}% ${below ? '+' : '-'} 1.75rem)`,
      }}
    >
      <p className="text-sm font-semibold text-steel-50">{place.label}</p>
      {place.precision === 'state' ? (
        <p className="mt-0.5 text-[0.6875rem] leading-snug text-warn-400">
          Somewhere in {place.label} — {place.towns.length ? place.towns.join(', ') : 'town not recorded'}
        </p>
      ) : (
        place.state && <p className="text-[0.6875rem] text-steel-500">{place.state}</p>
      )}

      <p className="mt-1.5 text-sm tabular-nums text-steel-100">
        {formatNumber(place.total)} {place.total === 1 ? 'lead' : 'leads'}
      </p>
      <p className="text-[0.6875rem] tabular-nums text-steel-400">
        {place.open} open · {place.converted} converted
        {place.quiet ? <span className="text-danger-400"> · {place.quiet} gone quiet</span> : null}
      </p>
    </div>
  );
}

export default function LeadMap({ geography, selected, onSelect }) {
  const [hovered, setHovered] = useState(null);

  const places = geography?.places || [];
  const unplaced = geography?.unplaced || [];

  if (!places.length && !unplaced.length) {
    return <p className="py-6 text-center text-sm text-steel-500">No addresses recorded yet.</p>;
  }

  const largest = Math.max(...places.map((place) => place.total), 1);
  // Drawn largest first so a small dot is never buried under a big one it sits inside.
  const drawn = [...places].sort((a, b) => b.total - a.total);
  const names = labelled(drawn, largest);
  const active = hovered && places.find((place) => idOf(place) === hovered);

  const isSelected = (place) =>
    selected && selected.value === place.label && selected.field === (place.precision === 'state' ? 'state' : 'city');

  const choose = (place) => {
    if (!onSelect || !place) return;
    const field = place.precision === 'state' ? 'state' : 'city';
    // Clicking the place already filtered clears it — the same handle both ways round.
    onSelect(isSelected(place) ? null : { field, value: place.label });
  };

  /**
   * Which place the pointer is asking about — the nearest one, not the topmost ink.
   *
   * Circles are painted largest first so a small town is never buried inside a big one, and
   * that is the right order to *look* at. It is the wrong order to *click*: Tiruppur, the
   * biggest mark this business has, sits under Coimbatore and Erode fifty kilometres either
   * side of it, and hit-testing by ink made the single most important dot on the map
   * unreachable — at its centre and at its edge both.
   *
   * So pointing is answered by distance instead. Aim at where a place is and you get that
   * place, whoever is drawn over it.
   */
  const nearest = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    // Uniform scale — the svg keeps the viewBox's aspect — so this mapping is exact.
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    const y = ((event.clientY - box.top) / box.height) * HEIGHT;

    let found = null;
    let closest = Infinity;

    for (const place of drawn) {
      const [px, py] = project(place.lat, place.lng);
      const distance = (px - x) ** 2 + (py - y) ** 2;
      // Its own circle, or a finger's width for the smallest marks.
      const reach = Math.max(radiusFor(place.total, largest), 18);
      if (distance < closest && distance <= reach ** 2) {
        found = place;
        closest = distance;
      }
    }

    return found;
  };

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="relative">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT.toFixed(0)}`}
            className="h-auto w-full overflow-visible"
            role="img"
            aria-label={`Map of India showing leads in ${places.length} places`}
          >
            {/* The country behind the data, faint enough that the dots are the picture. */}
            <path
              d={OUTLINE}
              className="pointer-events-none fill-line/[0.03] stroke-line/[0.14]"
              strokeWidth={2}
            />

            {drawn.map((place) => {
              const [x, y] = project(place.lat, place.lng);
              const radius = radiusFor(place.total, largest);
              const quiet = place.quiet > 0;
              const chosen = isSelected(place);

              return (
                <g key={idOf(place)}>
                  {chosen && (
                    <circle cx={x} cy={y} r={radius + 7} className="fill-none stroke-steel-50" strokeWidth={2.5} />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    tabIndex={0}
                    role={onSelect ? 'button' : 'img'}
                    className={`outline-none transition-opacity ${
                      quiet ? 'fill-danger-500/45 stroke-danger-400' : 'fill-flame-500/40 stroke-flame-400'
                    } ${hovered && hovered !== idOf(place) ? 'opacity-40' : 'opacity-100'}`}
                    strokeWidth={2}
                    // A guess drawn as a guess: the town was not recognised, so this is the
                    // middle of its state and the edge says so without needing the tooltip.
                    strokeDasharray={place.precision === 'state' ? '5 4' : undefined}
                    // Pointing is handled once, by distance, on the sheet below — see
                    // `nearest`. Focus and the keyboard still belong to the mark itself.
                    style={{ pointerEvents: 'none' }}
                    onFocus={() => setHovered(idOf(place))}
                    onBlur={() => setHovered(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        choose(place);
                      }
                    }}
                  >
                    <title>
                      {`${place.label}: ${place.total} leads, ${place.open} open${
                        place.quiet ? `, ${place.quiet} gone quiet` : ''
                      }`}
                    </title>
                  </circle>
                </g>
              );
            })}

            {/*
              * Only the biggest few, and only where the name has room. Every dot named is a map
              * nobody can read; two names in the same place is worse than neither.
              */}
            {names.map(({ place, x, y }) => (
              <text
                key={`label-${idOf(place)}`}
                x={x}
                y={y}
                textAnchor="middle"
                // Painted stroke-first, so the word sits on the map rather than in the dots.
                style={{ paintOrder: 'stroke' }}
                strokeWidth={5}
                strokeLinejoin="round"
                className="pointer-events-none fill-steel-200 stroke-ink-850 text-[22px] font-semibold"
              >
                {place.label}
              </text>
            ))}

            {/*
              * One sheet over the whole map that answers "which place is this?" by distance.
              * Above everything, so it is asked before any circle is; see `nearest` for why
              * pointing cannot be left to whichever circle happens to be painted on top.
              */}
            <rect
              width={WIDTH}
              height={HEIGHT}
              fill="transparent"
              className={onSelect && hovered ? 'cursor-pointer' : undefined}
              onMouseMove={(event) => {
                const place = nearest(event);
                setHovered(place ? idOf(place) : null);
              }}
              onMouseLeave={() => setHovered(null)}
              onClick={(event) => choose(nearest(event))}
            />
          </svg>

          {active && <Tooltip place={active} />}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.6875rem] text-steel-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-flame-500/50 ring-1 ring-flame-400" />
            Being worked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-danger-500/50 ring-1 ring-danger-400" />
            Something here has gone quiet
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-dashed border-steel-400" />
            Town not recognised — placed in its state
          </span>
          <span>Circle area is the number of leads.</span>
        </div>
      </div>

      {/*
        * The values, beside the shape. Nobody reads eleven off a circle, and a map without the
        * numbers next to it is a picture rather than a report.
        */}
      <div className="lg:col-span-2">
        <ul className="space-y-1">
          {places.slice(0, 9).map((place) => {
            const chosen = isSelected(place);
            return (
              <li key={idOf(place)}>
                <button
                  type="button"
                  onClick={() => choose(place)}
                  onMouseEnter={() => setHovered(idOf(place))}
                  onMouseLeave={() => setHovered(null)}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${
                    chosen ? 'bg-flame-500/10' : 'hover:bg-line/[0.05]'
                  }`}
                >
                  <span className="truncate text-[0.8125rem] text-steel-200">
                    {place.label}
                    {place.precision === 'state' && (
                      <span className="ml-1.5 text-[0.625rem] uppercase tracking-wide text-warn-400">state only</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[0.8125rem] tabular-nums text-steel-100">
                    {place.total}
                    {place.quiet ? (
                      <span className="ml-1.5 text-[0.6875rem] text-danger-400">{place.quiet} quiet</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {places.length > 9 && (
          <p className="mt-2 px-2 text-xs text-steel-500">and {places.length - 9} more on the map.</p>
        )}

        {/*
          * What could not be drawn, said out loud. A map that quietly omits places looks
          * exactly like a business that has none there, and this is the only line that can
          * tell the two apart.
          */}
        {Boolean(unplaced.length) && (
          <div className="mt-4 border-t border-line/[0.06] pt-3">
            <p className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
              Not on the map ({geography.unplacedTotal})
            </p>
            <p className="mt-1 text-xs leading-relaxed text-steel-400">
              {unplaced.map((row) => `${row.label} (${row.value})`).join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
