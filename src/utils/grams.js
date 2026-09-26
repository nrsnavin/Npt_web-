/**
 * Gram weights, carried to five decimals — as the plant weighs and costs them, and as the server
 * keeps them (Mould.js `roundGrams`, Material.js `grammageFrom`).
 */
export const GRAM_DECIMALS = 5;
/** For `<input type="number" step>`: the browser refuses a finer figure than the step. */
export const GRAM_STEP = '0.00001';

export const roundGrams = (value) => Math.round((Number(value) || 0) * 100000) / 100000;

/** `33` → "33 g", `38.94` → "38.94 g", `12.345671` → "12.34567 g"; no trailing zeros. */
export const formatGrams = (value) =>
  value === undefined || value === null || value === '' || Number.isNaN(Number(value))
    ? '—'
    : `${Number(roundGrams(value).toFixed(GRAM_DECIMALS))} g`;
