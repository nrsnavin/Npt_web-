import { useMemo, useState } from 'react';
import { BOUNDS, INDIA_STATES, SQUEEZE } from '../data/indiaStates.js';
import { formatNumber } from '../utils/format.js';

/**
 * Where the business actually is.
 *
 * "Where they are" was a sorted list of towns, which answers exactly one question — which town
 * has the most — and hides the ones somebody came for. Is this a Tiruppur business with a few
 * outliers, or is it four regions? Is there a cluster in Gujarat nobody has been to since
 * March? Is the whole of the north one customer? A sorted list cannot show any of those,
 * because sorting is precisely the act of throwing away where the places are.
 *
 * **Two layers, two questions, two jobs.** The states are the base: shaded by how many leads
 * are in each, they answer "where do we sell at all, and how strongly" at a glance — the
 * regional reading nobody can get by summing circles by eye. The circles on top are towns, and
 * they answer "how many here, and is it healthy". Different units, so the two encodings do not
 * compete; a cool tint and warm marks, so they do not blur.
 *
 * **The list stays beside the map**, now grouped by state to match what the shading says. A map
 * is very good at shape and very bad at value — nobody reads eleven off a circle — and the two
 * together answer both halves of the question.
 *
 * **Area, not radius.** A place with four times the leads gets a circle of four times the
 * *area*, which is what the eye compares. Scaling the radius instead is the commonest chart lie
 * there is: it draws that place sixteen times as large.
 */

/* --------------------------------- The frame --------------------------------- */

const WIDTH = 1000;
const SCALE = WIDTH / ((BOUNDS.east - BOUNDS.west) * SQUEEZE);
const HEIGHT = (BOUNDS.north - BOUNDS.south) * SCALE;

const project = (lat, lng) => [
  (lng - BOUNDS.west) * SQUEEZE * SCALE,
  (BOUNDS.north - lat) * SCALE,
];

/**
 * The state outlines, turned into paths once.
 *
 * At module scope on purpose: thirty-six states of geometry do not change when a lead does, and
 * rebuilding four thousand points on every hover is how a map starts to feel slow.
 */
const STATE_PATHS = INDIA_STATES.map(([name, rings]) => ({
  name,
  d: rings
    .map((flat) => {
      let path = '';
      for (let index = 0; index < flat.length; index += 2) {
        const [x, y] = project(flat[index + 1], flat[index]);
        path += `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      return `${path}Z`;
    })
    .join(''),
}));

/* --------------------------------- The marks --------------------------------- */

/** Big enough to hit with a finger at the smallest, small enough not to swallow its neighbours. */
const MIN_RADIUS = 9;
const MAX_RADIUS = 38;

const radiusFor = (value, largest) =>
  MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(value / Math.max(largest, 1));

/**
 * A place's identity, which is not its name.
 *
 * Delhi is a city and Delhi is a state, and a book with leads in both draws two marks with one
 * label. Keyed on the label alone, hovering one showed the other's figures — a tooltip
 * confidently describing the wrong place, which is the worst kind of wrong a map can be.
 */
const idOf = (place) => `${place.precision}:${place.label}`;

/**
 * How dark a state is shaded.
 *
 * Four steps rather than a continuous ramp. A continuous one implies a precision that is not
 * there — the difference between six leads and seven is not a difference anybody should be
 * reading off a fill — and four bands are the most a person can tell apart without a legend
 * they have to keep looking back at.
 */
const SHADES = [0.14, 0.26, 0.4, 0.56];

/**
 * Opacities rather than classes, and the swatch built from the same numbers.
 *
 * Tailwind only generates the classes it can see in the source. The legend built its swatch by
 * rewriting the map's class at runtime — a string Tailwind never sees — so the key to the
 * shading rendered blank while the map itself was shaded. A legend that does not match the
 * picture is worse than no legend, and the fix is for both to read one array of numbers.
 */
export const shadeOf = (value, largest) =>
  value ? SHADES[Math.min(SHADES.length - 1, Math.floor(((value - 1) / Math.max(largest, 1)) * SHADES.length))] : 0;

/** The tint itself, from the theme's own channels, so it follows light and dark. */
const aqua = (alpha) => `rgb(var(--aqua-500) / ${alpha})`;

/**
 * How tall the map is allowed to be, and with it the panel beside it.
 *
 * One figure, used twice on purpose: the map and its list are two halves of one answer, and a
 * section whose two columns end at different places reads as two things that happened to be put
 * near each other. It also keeps the whole section a knowable height instead of however tall
 * eleven states of list happen to be.
 */
const MAP_HEIGHT = 'md:h-[24rem] lg:h-[26rem] xl:h-[32rem]';

/**
 * Which marks get their name written beside them.
 *
 * Not simply the biggest few: the biggest few of this business are Tiruppur, Coimbatore and
 * Erode, which are fifty kilometres apart and printed one on top of another — three names in
 * the same place, none readable. So it is greedy by size, and a name is written only where it
 * does not land on one already written. The ones that lose out are spelled out in the list
 * beside the map, which is where somebody reads a name off anyway.
 */
function labelled(places, largest) {
  const placed = [];

  for (const place of places) {
    const [x, y] = project(place.lat, place.lng);
    const top = y - radiusFor(place.total, largest) - 7;
    // Rough, and rough is enough: it decides whether to write a word, not where a dot goes.
    const halfWidth = place.label.length * 5.5 + 6;
    const box = { left: x - halfWidth, right: x + halfWidth, top: top - 20, bottom: top + 4 };

    const clashes = placed.some(
      (other) =>
        box.left < other.box.right &&
        box.right > other.box.left &&
        box.top < other.box.bottom &&
        box.bottom > other.box.top
    );

    if (!clashes) placed.push({ place, x, y: top, box });
    if (placed.length >= 8) break;
  }

  return placed;
}

/* -------------------------------- The tooltip -------------------------------- */

function Tooltip({ at, title, subtitle, tone, lines }) {
  const [x, y] = at;
  // A card hanging above a mark near the top edge hangs off the map. Ludhiana and Srinagar are
  // real places with real leads, so it flips under them rather than being cut in half.
  const below = y / HEIGHT < 0.2;
  const left = x / WIDTH;

  return (
    <div
      className={`pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-xl border border-line/[0.1] bg-ink-800 px-3.5 py-2.5 shadow-float ${
        below ? '' : '-translate-y-full'
      } ${left > 0.72 ? '-translate-x-full' : left < 0.28 ? '' : '-translate-x-1/2'}`}
      style={{ left: `${left * 100}%`, top: `calc(${(y / HEIGHT) * 100}% ${below ? '+' : '-'} 1.6rem)` }}
    >
      <p className="text-sm font-semibold leading-tight text-steel-50">{title}</p>
      {subtitle && <p className={`mt-0.5 text-[0.6875rem] leading-snug ${tone || 'text-steel-500'}`}>{subtitle}</p>}
      {lines}
    </div>
  );
}

/* ------------------------------- The component ------------------------------- */

export default function LeadMap({ geography, selected, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const [hoveredState, setHoveredState] = useState(null);

  const places = geography?.places || [];
  const unplaced = geography?.unplaced || [];

  /**
   * The same leads, added up by state.
   *
   * Built here rather than asked for, because the state total is exactly the sum of the town
   * marks and a second figure from the server could disagree with the dots drawn over it.
   */
  const byState = useMemo(() => {
    const totals = new Map();
    for (const place of places) {
      if (!place.state) continue;
      const row = totals.get(place.state) || { total: 0, quiet: 0, converted: 0, towns: [] };
      row.total += place.total;
      row.quiet += place.quiet;
      row.converted += place.converted;
      row.towns.push(place);
      totals.set(place.state, row);
    }
    for (const row of totals.values()) row.towns.sort((a, b) => b.total - a.total);
    return totals;
  }, [places]);

  if (!places.length && !unplaced.length) {
    return <p className="py-6 text-center text-sm text-steel-500">No addresses recorded yet.</p>;
  }

  const largest = Math.max(...places.map((place) => place.total), 1);
  const largestState = Math.max(...[...byState.values()].map((row) => row.total), 1);
  // Drawn largest first so a small town is never buried under a big one it sits inside.
  const drawn = [...places].sort((a, b) => b.total - a.total);
  const names = labelled(drawn, largest);

  const active = hovered && places.find((place) => idOf(place) === hovered);
  const activeState = !active && hoveredState && byState.get(hoveredState);

  const fieldFor = (place) => (place.precision === 'state' ? 'state' : 'city');

  const isSelected = (place) => selected?.value === place.label && selected?.field === fieldFor(place);
  const isSelectedState = (name) => selected?.field === 'state' && selected?.value === name;

  const choose = (place) => {
    if (!onSelect || !place) return;
    // Choosing what is already chosen clears it — the same handle both ways round.
    onSelect(isSelected(place) ? null : { field: fieldFor(place), value: place.label });
  };

  const chooseState = (name) => {
    if (!onSelect || !byState.has(name)) return;
    onSelect(isSelectedState(name) ? null : { field: 'state', value: name });
  };

  /**
   * What the pointer is asking about — the nearest town, not the topmost ink.
   *
   * Circles are painted largest first so a small town is never buried inside a big one, and
   * that is the right order to *look* at. It is the wrong order to *click*: Tiruppur, the
   * biggest mark this business has, sits under Coimbatore and Erode fifty kilometres either
   * side, and hit-testing by ink made the most important dot on the map unreachable — at its
   * centre and at its edge both. Pointing is answered by distance instead.
   */
  const nearest = (event) => {
    /*
     * The svg's box, never the target's. The pointer lands on whichever state path is under it,
     * and measuring that path's own bounds put every coordinate somewhere else entirely — the
     * map answered with the wrong town, or with none.
     */
    const box = (event.currentTarget.ownerSVGElement || event.currentTarget).getBoundingClientRect();
    // Uniform scale — the svg keeps the viewBox's aspect — so this mapping is exact.
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    const y = ((event.clientY - box.top) / box.height) * HEIGHT;

    let found = null;
    let closest = Infinity;

    for (const place of drawn) {
      const [px, py] = project(place.lat, place.lng);
      const distance = (px - x) ** 2 + (py - y) ** 2;
      // Its own circle, or a finger's width for the smallest marks.
      const reach = Math.max(radiusFor(place.total, largest), 16);
      if (distance < closest && distance <= reach ** 2) {
        found = place;
        closest = distance;
      }
    }

    return found;
  };

  const headline = () => {
    const total = places.reduce((sum, place) => sum + place.total, 0);
    const quiet = places.reduce((sum, place) => sum + place.quiet, 0);
    const states = byState.size;

    if (!total) return 'Nothing has an address on it yet.';
    return `${formatNumber(total)} ${total === 1 ? 'lead' : 'leads'} across ${states} ${
      states === 1 ? 'state' : 'states'
    }${quiet ? `, ${quiet} of them gone quiet` : ''}.`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <p className="mb-3 text-[0.8125rem] leading-relaxed text-steel-400">{headline()}</p>

      {/*
        * Two boxes rather than one, and the reason is the tooltip.
        *
        * India is thirty degrees of latitude, so a map drawn to the column's width came out
        * eight hundred pixels tall — one section taller than the screen, with every chart on
        * the page below the fold. The cap fixes that, but capping height while the width is
        * also fixed would letterbox the drawing inside its element, and both the tooltip and
        * the hit-testing measure that element to convert pixels into places: they would have
        * pointed at the wrong town by however wide the empty margins were.
        *
        * So only ever one dimension is constrained — width on a narrow screen, height on a
        * wide one — and the inner box shrinks to whatever the drawing actually is, which is
        * what the tooltip is positioned against.
        */}
        <div className="flex justify-center">
          {/* `w-auto` switches on at exactly the breakpoint the height does, so the two are
              never constrained at once and the drawing always fills its element. */}
          <div className="relative w-full md:w-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT.toFixed(0)}`}
            className={`block w-full md:w-auto ${MAP_HEIGHT}`}
            role="img"
            aria-label={`Map of India showing leads in ${places.length} places across ${byState.size} states`}
          >
            {/* The base: which states this business is in, and how strongly. */}
            <g className="pointer-events-none">
              {STATE_PATHS.map(({ name, d }) => {
                const row = byState.get(name);
                const chosen = isSelectedState(name);

                const lit = hoveredState === name && row;

                return (
                  <path
                    key={name}
                    d={d}
                    // A state this business is not in still gets a face, just a blank one:
                    // the country has to read as a country for the shaded parts to mean
                    // anything against it.
                    fill={row ? aqua(shadeOf(row.total, largestState) + (lit ? 0.12 : 0)) : 'rgb(var(--line) / 0.05)'}
                    className={`transition-[fill] ${
                      chosen ? 'stroke-steel-100' : lit ? 'stroke-aqua-400' : 'stroke-line/[0.16]'
                    }`}
                    strokeWidth={chosen ? 3 : lit ? 2.5 : 1.2}
                    strokeLinejoin="round"
                  />
                );
              })}
            </g>

            {/* The towns. */}
            {drawn.map((place) => {
              const [x, y] = project(place.lat, place.lng);
              const radius = radiusFor(place.total, largest);
              const quiet = place.quiet > 0;
              const chosen = isSelected(place);
              const dimmed = (hovered && hovered !== idOf(place)) || (activeState && place.state !== hoveredState);

              return (
                <g key={idOf(place)}>
                  {chosen && (
                    <circle cx={x} cy={y} r={radius + 6} className="fill-none stroke-steel-50" strokeWidth={2.5} />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    tabIndex={0}
                    role={onSelect ? 'button' : 'img'}
                    className={`outline-none transition-opacity ${
                      quiet ? 'fill-danger-500/50 stroke-danger-400' : 'fill-flame-500/45 stroke-flame-400'
                    } ${dimmed ? 'opacity-45' : 'opacity-100'}`}
                    strokeWidth={1.8}
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
              * Only where the name has room. Every dot named is a map nobody can read; two
              * names in the same place is worse than neither.
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
                className="pointer-events-none fill-steel-100 stroke-ink-850 text-[21px] font-semibold"
              >
                {place.label}
              </text>
            ))}

            {/*
              * One sheet over the whole map, asked before any shape below it: which town is
              * nearest, and failing that, which state is under the pointer. Two questions on
              * one surface, so a click never depends on which layer happens to be on top.
              */}
            <g
              onMouseLeave={() => {
                setHovered(null);
                setHoveredState(null);
              }}
            >
              {STATE_PATHS.map(({ name, d }) => (
                <path
                  key={`hit-${name}`}
                  d={d}
                  fill="transparent"
                  className={onSelect && byState.has(name) ? 'cursor-pointer' : undefined}
                  onMouseMove={(event) => {
                    const place = nearest(event);
                    setHovered(place ? idOf(place) : null);
                    setHoveredState(place ? place.state : name);
                  }}
                  onClick={(event) => {
                    const place = nearest(event);
                    if (place) choose(place);
                    else chooseState(name);
                  }}
                />
              ))}
            </g>
          </svg>

          {active && (
            <Tooltip
              at={project(active.lat, active.lng)}
              title={active.label}
              subtitle={
                active.precision === 'state'
                  ? `Somewhere in ${active.label} — ${active.towns.length ? active.towns.join(', ') : 'town not recorded'}`
                  : active.state
              }
              tone={active.precision === 'state' ? 'text-warn-400' : undefined}
              lines={
                <>
                  <p className="mt-1.5 text-sm tabular-nums text-steel-100">
                    {formatNumber(active.total)} {active.total === 1 ? 'lead' : 'leads'}
                  </p>
                  <p className="text-[0.6875rem] tabular-nums text-steel-400">
                    {active.open} open · {active.converted} converted
                    {active.quiet ? <span className="text-danger-400"> · {active.quiet} gone quiet</span> : null}
                  </p>
                </>
              }
            />
          )}

          {activeState && (
            <Tooltip
              at={project(...stateAnchor(activeState))}
              title={hoveredState}
              subtitle={`${activeState.towns.length} ${activeState.towns.length === 1 ? 'place' : 'places'}`}
              lines={
                <>
                  <p className="mt-1.5 text-sm tabular-nums text-steel-100">
                    {formatNumber(activeState.total)} {activeState.total === 1 ? 'lead' : 'leads'}
                  </p>
                  <p className="text-[0.6875rem] tabular-nums text-steel-400">
                    {activeState.converted} converted
                    {activeState.quiet ? <span className="text-danger-400"> · {activeState.quiet} gone quiet</span> : null}
                  </p>
                </>
              }
            />
          )}
          </div>
        </div>

        <Legend largest={largest} largestState={largestState} />
      </div>

      {/*
        * The values, beside the shape, grouped the way the shading is. Nobody reads eleven off
        * a circle, and a map without its numbers next to it is a picture rather than a report.
        */}
      <div className="flex min-h-0 flex-col lg:col-span-2">
        {/*
          * Scrolls within itself rather than setting the height of the whole section. Eleven
          * states of list ran a third of a screen past the map it belongs to, which left the
          * section ending in a column of names beside nothing at all.
          */}
        {/* Written out rather than derived from MAP_HEIGHT: Tailwind only generates the
            classes it can see in the source, and a name built at runtime is not one. */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 lg:max-h-[26rem] xl:max-h-[32rem]">
          <StateList
            byState={byState}
            onPlace={choose}
            onState={chooseState}
            onHover={(place, state) => {
              setHovered(place ? idOf(place) : null);
              setHoveredState(state || null);
            }}
            isSelected={isSelected}
            isSelectedState={isSelectedState}
          />
        </div>

        {/*
          * What could not be drawn, said out loud, and outside the scrolling part: a map that
          * quietly omits places looks exactly like a business that has none there, and the one
          * line that can tell those apart must not be the line you have to scroll to find.
          */}
        {Boolean(unplaced.length) && (
          <div className="mt-3 shrink-0 border-t border-line/[0.06] pt-3">
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

/** Where a state's tooltip points: its busiest town, which is where the eye already is. */
function stateAnchor(row) {
  const busiest = row.towns[0];
  return [busiest.lat, busiest.lng];
}

/* --------------------------------- The legend --------------------------------- */

/**
 * A legend somebody can read without looking back at it twice.
 *
 * The size scale is drawn as nested circles rather than described in a sentence, because "area
 * is the count" is a claim a reader has to take on trust and three circles with numbers under
 * them is a thing they can check against the map in front of them.
 */
function Legend({ largest, largestState }) {
  const steps = [...new Set([1, Math.max(2, Math.round(largest / 3)), largest])].filter(
    (value) => value <= largest
  );

  return (
    <div className="mt-4 flex flex-wrap items-end gap-x-7 gap-y-4 border-t border-line/[0.06] pt-4">
      <div>
        <p className="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
          Leads in a town
        </p>
        <div className="flex items-end gap-3">
          {steps.map((value) => {
            const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt(value / largest);
            const size = (radius / MAX_RADIUS) * 34;
            return (
              <div key={value} className="flex flex-col items-center gap-1">
                <span
                  className="rounded-full border border-flame-400 bg-flame-500/45"
                  style={{ width: `${size}px`, height: `${size}px` }}
                />
                <span className="text-[0.625rem] tabular-nums text-steel-500">{value}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
          How it is going
        </p>
        <div className="space-y-1">
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-steel-400">
            <span className="h-2.5 w-2.5 rounded-full border border-flame-400 bg-flame-500/45" />
            Being worked
          </span>
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-steel-400">
            <span className="h-2.5 w-2.5 rounded-full border border-danger-400 bg-danger-500/50" />
            Something here has gone quiet
          </span>
          <span className="flex items-center gap-1.5 text-[0.6875rem] text-steel-400">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-steel-400" />
            Town not recognised — placed in its state
          </span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">
          Leads in a state
        </p>
        <div className="flex items-center gap-0.5">
          {SHADES.map((shade) => (
            <span
              key={shade}
              className="h-4 w-8 border border-line/[0.12]"
              style={{ backgroundColor: aqua(shade) }}
              aria-hidden
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[0.625rem] tabular-nums text-steel-500">
          <span>1</span>
          <span>{largestState}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- The list ---------------------------------- */

/**
 * The book by state, then by town.
 *
 * Grouped rather than a flat top nine, so the panel says the same thing the shading does. A
 * flat list ordered by town buries the fact that four of the top nine are one state fifty
 * kilometres across — which is the single most useful thing on this screen for anybody
 * planning a week of visits.
 */
function StateList({ byState, onPlace, onState, onHover, isSelected, isSelectedState }) {
  const states = [...byState.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <ul className="space-y-3">
      {states.map(([name, row]) => (
        <li key={name}>
          <button
            type="button"
            onClick={() => onState(name)}
            onMouseEnter={() => onHover(null, name)}
            onMouseLeave={() => onHover(null, null)}
            className={`flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${
              isSelectedState(name) ? 'bg-aqua-500/10' : 'hover:bg-line/[0.05]'
            }`}
          >
            <span className="truncate text-[0.8125rem] font-semibold text-steel-100">{name}</span>
            <span className="shrink-0 text-[0.8125rem] tabular-nums text-steel-200">
              {row.total}
              {row.quiet ? <span className="ml-1.5 text-[0.6875rem] text-danger-400">{row.quiet} quiet</span> : null}
            </span>
          </button>

          <ul className="mt-0.5 space-y-px border-l border-line/[0.08] pl-2">
            {row.towns.map((place) => (
              <li key={idOf(place)}>
                <button
                  type="button"
                  onClick={() => onPlace(place)}
                  onMouseEnter={() => onHover(place, place.state)}
                  onMouseLeave={() => onHover(null, null)}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors ${
                    isSelected(place) ? 'bg-flame-500/10' : 'hover:bg-line/[0.05]'
                  }`}
                >
                  <span className="truncate text-[0.8125rem] text-steel-300">
                    {place.precision === 'state' ? (
                      <span className="text-steel-400">
                        Elsewhere in {place.label}
                        <span className="ml-1.5 text-[0.625rem] uppercase tracking-wide text-warn-400">
                          town unknown
                        </span>
                      </span>
                    ) : (
                      place.label
                    )}
                  </span>
                  <span className="shrink-0 text-[0.8125rem] tabular-nums text-steel-300">
                    {place.total}
                    {place.quiet ? (
                      <span className="ml-1.5 text-[0.6875rem] text-danger-400">{place.quiet}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
