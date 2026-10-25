import { swatchOf } from '../../utils/planningBoard.js';

/* A see-through resin reads as a checkerboard. */
const CLEAR = { backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%)', backgroundSize: '6px 6px' };

/**
 * A dot of the hanger's colour, beside its name — never instead of it. An unknown colour is a
 * dashed ring, so it does not pretend to be one it is not.
 */
export default function Swatch({ colour, className = 'h-3.5 w-3.5' }) {
  const fill = swatchOf(colour);
  if (!fill) return <span aria-hidden="true" className={`${className} inline-block shrink-0 rounded-full border border-dashed border-line/30`} />;
  return (
    <span
      aria-hidden="true"
      className={`${className} inline-block shrink-0 rounded-full ring-1 ring-inset ring-black/15`}
      style={fill === 'clear' ? CLEAR : { backgroundColor: fill }}
    />
  );
}
