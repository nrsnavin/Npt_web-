import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * A mind map: one thing at the centre, what hangs off it, and what hangs off those.
 *
 * **Why a picture at all.** A customer screen is six stacked tables, and a reader answering
 * "where has this buyer got to" has to hold all six in their head at once — three enquiries, one
 * of them quoted, the quotation became an order, the order is half despatched and unpaid. Every
 * one of those facts is on the screen already and the *shape* of them is not, because a table
 * can only show one relation at a time. The map's whole job is the shape.
 *
 * It does not replace the tables and must not. Exact figures, sorting and copying a number out
 * are what a table is for, and they are also what a screen reader and a keyboard can work with
 * — so the list view stays, it stays the default, and this is something a reader switches to.
 *
 * **Why no graph library.** The bundle is already 380 kB and this layout is arithmetic, not
 * physics: there is a root, one ring of branches and their leaves, and nothing moves. A force
 * simulation would add weight, a frame budget and a layout that comes out differently every time
 * somebody opens the screen — which is the opposite of what a map for recognising a record wants.
 *
 * **Why two-sided rather than radial.** A radial map has to place a label at every angle, so
 * text either rotates or collides, and both get worse as the labels get longer — and these
 * labels are company names and model numbers, which are long and cannot be abbreviated. Splitting
 * the branches left and right keeps every label horizontal and every stack vertical, so nothing
 * can overlap whatever the data does. It is also the layout every mind-map tool opens with, which
 * means nobody has to learn it.
 */

/* Geometry. All of it here, because a layout tuned in six places is one nobody can adjust. */
const NODE_W = 188;
const NODE_H = 44;
const LEAF_H = 38;
/** Vertical pitch of a leaf. Bigger than the leaf so stacks breathe and edges stay readable. */
const ROW = 50;
/** How far a branch sits from the root, and a leaf from its branch. */
const BRANCH_X = 190;
const LEAF_X = 236;
const PAD = 32;

const TONES = {
  neutral: 'text-steel-400',
  info: 'text-aqua-300',
  progress: 'text-warn-400',
  success: 'text-success-400',
  danger: 'text-danger-400',
  accent: 'text-flame-400',
};

/** A label that will not fit, cut on a word so it does not end mid-syllable. */
const clip = (text, room) => {
  const clean = String(text ?? '').trim();
  if (clean.length <= room) return clean;
  const cut = clean.slice(0, room);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > room * 0.6 ? space : room)}…`;
};

/**
 * Which side each branch goes on.
 *
 * Balanced by the height a branch will actually occupy rather than by how many there are: one
 * branch with nine leaves and three with one apiece is not a fair split three-to-one, and the
 * map would hang off one side with the other half empty. Tallest first, each to whichever side
 * is currently shorter — the same greedy rule you would use by hand.
 */
function splitSides(branches) {
  const heights = branches.map((branch) => Math.max(1, branch.leaves?.length || 0) * ROW);
  const order = branches
    .map((branch, index) => ({ branch, height: heights[index], index }))
    .sort((a, b) => b.height - a.height || a.index - b.index);

  const right = [];
  const left = [];
  let rightHeight = 0;
  let leftHeight = 0;

  for (const entry of order) {
    if (rightHeight <= leftHeight) {
      right.push(entry);
      rightHeight += entry.height;
    } else {
      left.push(entry);
      leftHeight += entry.height;
    }
  }

  /* Back into the caller's order within each side, so the map does not reshuffle itself when
     one enquiry is added and the greedy pass happens to run differently. */
  const byIndex = (a, b) => a.index - b.index;
  return { right: right.sort(byIndex), left: left.sort(byIndex), rightHeight, leftHeight };
}

/** Everything placed, in one pass, so the renderer below only draws. */
function layout(branches) {
  const { right, left, rightHeight, leftHeight } = splitSides(branches);
  const height = Math.max(rightHeight, leftHeight, ROW * 2) + PAD * 2;
  const width = (BRANCH_X + LEAF_X + NODE_W) * 2 + PAD * 2;

  const cx = width / 2;
  const cy = height / 2;
  const placed = [];

  for (const [side, entries, total] of [
    [1, right, rightHeight],
    [-1, left, leftHeight],
  ]) {
    let y = cy - total / 2;

    for (const { branch } of entries) {
      const span = Math.max(1, branch.leaves?.length || 0) * ROW;
      const branchY = y + span / 2;
      const branchX = cx + side * BRANCH_X;

      const leaves = (branch.leaves || []).map((leaf, index) => ({
        ...leaf,
        x: cx + side * (BRANCH_X + LEAF_X),
        y: y + index * ROW + ROW / 2,
      }));

      placed.push({ ...branch, x: branchX, y: branchY, side, leaves });
      y += span;
    }
  }

  return { width, height, cx, cy, branches: placed };
}

/**
 * The curve from one node to another.
 *
 * Drawn from the *edge* of each box rather than its centre, so a line never runs underneath a
 * label and out the other side. Horizontal control points give the flat-then-turn shape a mind
 * map has, which also makes two edges leaving the same branch distinguishable where straight
 * lines would overlap for most of their length.
 */
const edge = (fromX, fromY, toX, toY, side) => {
  const start = fromX + side * (NODE_W / 2);
  const end = toX - side * (NODE_W / 2);
  const bend = (end - start) / 2;
  return `M ${start} ${fromY} C ${start + bend} ${fromY}, ${end - bend} ${toY}, ${end} ${toY}`;
};

function Node({ node, width, height, bold, onOpen }) {
  const tone = TONES[node.tone] || TONES.neutral;
  const open = node.to ? () => onOpen(node.to) : undefined;

  return (
    <g
      className={`mm-node ${tone}`}
      role={open ? 'link' : undefined}
      tabIndex={open ? 0 : undefined}
      aria-label={node.sublabel ? `${node.label}. ${node.sublabel}` : node.label}
      onClick={open}
      onKeyDown={
        open
          ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              open();
            }
          }
          : undefined
      }
    >
      <rect
        x={node.x - width / 2}
        y={node.y - height / 2}
        width={width}
        height={height}
        rx="10"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeOpacity="0.35"
      />
      <text
        x={node.x}
        y={node.sublabel ? node.y - 2 : node.y + 4}
        textAnchor="middle"
        fill="currentColor"
        className={bold ? 'font-bold' : 'font-semibold'}
        style={{ fontSize: bold ? 14 : 13 }}
      >
        {clip(node.label, bold ? 24 : 22)}
      </text>
      {node.sublabel && (
        <text
          x={node.x}
          y={node.y + 13}
          textAnchor="middle"
          fill="currentColor"
          fillOpacity="0.72"
          style={{ fontSize: 11 }}
        >
          {clip(node.sublabel, 28)}
        </text>
      )}
    </g>
  );
}

export default function MindMap({ root, branches = [], emptyLabel = 'Nothing to map yet' }) {
  const navigate = useNavigate();
  const scroller = useRef(null);
  const drag = useRef(null);

  const map = useMemo(() => layout(branches), [branches]);
  const onOpen = useCallback((to) => navigate(to), [navigate]);

  /*
   * How wide the map may be drawn. Measured rather than assumed, because "fit" has to mean fit:
   * the first version opened at natural size and clipped the right-hand branches off the edge,
   * with a Fit button that did nothing but return to the size that was clipping them. A map
   * whose far side is invisible until somebody thinks to drag it is a map nobody trusts.
   */
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    if (!scroller.current || typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(([entry]) => setRoom(entry.contentRect.width));
    watch.observe(scroller.current);
    return () => watch.disconnect();
  }, []);

  /* Never magnified to fill a wide screen — a four-node map blown up to 1.8× looks like an
     error. Fit means "no wider than the space", not "exactly the space". */
  const fitted = room ? Math.min(1, room / map.width) : 1;
  const [zoom, setZoom] = useState(null);
  const scale = zoom ?? fitted;

  /* A new record arriving changes the map's width, so a reader who has not touched the zoom
     gets the new fit rather than yesterday's. One who has chosen a zoom keeps it. */
  useEffect(() => {
    setZoom(null);
  }, [map.width, map.height]);

  /*
   * Drag to pan, because on a phone the map is wider than the screen and a two-finger scroll
   * over an SVG is not something anybody discovers. Implemented on the scroll container rather
   * than by moving the viewBox, so the scrollbars stay real and a trackpad still works.
   */
  const onPointerDown = (event) => {
    if (event.target.closest('[role="link"]')) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: scroller.current.scrollLeft,
      top: scroller.current.scrollTop,
    };
    scroller.current.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!drag.current) return;
    scroller.current.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
    scroller.current.scrollTop = drag.current.top - (event.clientY - drag.current.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  if (!branches.length) {
    return <p className="py-10 text-center text-sm text-steel-500">{emptyLabel}</p>;
  }

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10 flex gap-1.5">
        <button
          type="button"
          className="btn-secondary px-2.5 py-1 text-xs"
          onClick={() => setZoom((current) => Math.max(0.35, (current ?? fitted) - 0.15))}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="btn-secondary px-2.5 py-1 text-xs"
          onClick={() => setZoom(null)}
        >
          Fit
        </button>
        <button
          type="button"
          className="btn-secondary px-2.5 py-1 text-xs"
          onClick={() => setZoom((current) => Math.min(1.8, (current ?? fitted) + 0.15))}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      <div
        ref={scroller}
        className="overflow-auto rounded-lg border border-line/[0.06] bg-line/[0.015]"
        style={{ maxHeight: '32rem', cursor: drag.current ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <svg
          width={map.width * scale}
          height={map.height * scale}
          viewBox={`0 0 ${map.width} ${map.height}`}
          role="img"
          aria-label={`${root.label}: ${branches.length} branches`}
          className="block"
        >
          {/*
            Hover and keyboard focus, as CSS rather than classes: `fill-opacity` is an SVG
            presentation attribute and there is no Tailwind utility for it, so the
            `hover:fill-opacity-100` written here first did precisely nothing — every node was
            clickable and none of them looked it. A focus ring matters more than the hover:
            these are the only links on the screen a keyboard reaches, and an invisible focus
            is a map somebody can tab through and never see where they are.
          */}
          <style>{`
            .mm-node[role="link"] { cursor: pointer; }
            .mm-node[role="link"] rect { transition: fill-opacity .12s, stroke-opacity .12s; }
            .mm-node[role="link"]:hover rect { fill-opacity: .24; stroke-opacity: .65; }
            .mm-node[role="link"]:focus { outline: none; }
            .mm-node[role="link"]:focus-visible rect {
              stroke-opacity: 1; stroke-width: 2.5; fill-opacity: .24;
            }
          `}</style>
          {/* Edges first, so a line never sits on top of the box it ends at. */}
          <g fill="none" strokeWidth="1.5" strokeOpacity="0.28">
            {map.branches.map((branch) => (
              <g key={`e-${branch.key}`} className={TONES[branch.tone] || TONES.neutral}>
                <path d={edge(map.cx, map.cy, branch.x, branch.y, branch.side)} stroke="currentColor" />
                {branch.leaves.map((leaf) => (
                  <path
                    key={`e-${branch.key}-${leaf.key}`}
                    d={edge(branch.x, branch.y, leaf.x, leaf.y, branch.side)}
                    stroke="currentColor"
                  />
                ))}
              </g>
            ))}
          </g>

          {map.branches.map((branch) => (
            <g key={branch.key}>
              <Node node={branch} width={NODE_W} height={NODE_H} onOpen={onOpen} />
              {branch.leaves.map((leaf) => (
                <Node key={leaf.key} node={leaf} width={NODE_W} height={LEAF_H} onOpen={onOpen} />
              ))}
            </g>
          ))}

          {/* The hub last: it is the one node that must never be drawn over. */}
          <Node
            node={{ ...root, x: map.cx, y: map.cy, tone: root.tone || 'accent' }}
            width={NODE_W + 20}
            height={NODE_H + 10}
            bold
            onOpen={onOpen}
          />
        </svg>
      </div>

      <p className="mt-2 text-xs text-steel-500">
        Drag to move around, and click anything with a number on it to open it. The list view has
        the exact figures.
      </p>
    </div>
  );
}
