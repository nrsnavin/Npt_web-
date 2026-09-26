/**
 * Gram weights, carried to five decimals — as the plant weighs and costs them, and as the server
 * keeps them (Mould.js `cutGrams`, Material.js `grammageFrom`) — cut there, never rounded.
 */
export const GRAM_DECIMALS = 5;
/** For `<input type="number" step>`: the browser refuses a finer figure than the step. */
export const GRAM_STEP = '0.00001';

/**
 * Cut at five decimals, never rounded: 1.234567 g is 1.23456 g. Cleaned of floating-point noise
 * first — 1.23456 × 100000 is 123455.99999999999 here, and cutting that would lose a real digit.
 */
export const cutGrams = (value) => Math.trunc(Number(((Number(value) || 0) * 100000).toFixed(6))) / 100000;

/** `33` → "33 g", `38.94` → "38.94 g", `12.345679` → "12.34567 g"; no trailing zeros. */
export const formatGrams = (value) =>
  value === undefined || value === null || value === '' || Number.isNaN(Number(value))
    ? '—'
    : `${Number(cutGrams(value).toFixed(GRAM_DECIMALS))} g`;
