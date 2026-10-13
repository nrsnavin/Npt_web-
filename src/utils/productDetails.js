import { HANGER_CATEGORIES } from './pipeline.js';

/**
 * The product details a quotation or a sales order must not go out without — hook, clip,
 * packing — read off a line, and what the line does not say
 * [components/ProductDetailsConfirm.jsx]. The category is not one of them: a registered mould
 * fills its own, and it is shown where known.
 */

export const PRODUCT_DETAILS = [
  { key: 'hookRef', label: 'Hook' },
  { key: 'clipRef', label: 'Clip' },
  { key: 'packing', label: 'Packing' },
];

const given = (value) => !(value === undefined || value === null || value === false || String(value).trim() === '');

/** The labels of what the line does not say, in the sheet's order. */
export const missingDetails = (line = {}) =>
  PRODUCT_DETAILS.filter((detail) => !given(line[detail.key])).map((detail) => detail.label);

/** "Category, Hook and Packing" — a list said as a person says one. */
export const sayList = (labels = []) =>
  labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

const categoryLabel = (value) => HANGER_CATEGORIES.find((option) => (option.value ?? option) === value)?.label ?? value ?? '';

/** A register reference as a name, whether it came populated or as an id. */
const partName = (value) => (value && typeof value === 'object' ? value.name || value.code || 'Chosen' : value ? 'Chosen' : '');

/** The line's product details as label / value pairs, the blanks said as blanks. */
export function detailsOf(line = {}) {
  const material = line.materialRef && typeof line.materialRef === 'object' ? line.materialRef.name : undefined;
  return [
    ['Model', line.modelNumber || (line.mould && typeof line.mould === 'object' ? line.mould.mouldCode : '') || ''],
    ['Category', categoryLabel(line.category)],
    ['Size', line.sizeMm ? `${line.sizeMm} mm` : ''],
    ['Material', material || line.material || ''],
    ['Colour', line.colour || ''],
    ['Hook', partName(line.hookRef)],
    ['Clip', partName(line.clipRef)],
    ['Print', partName(line.printRef) || line.printing || ''],
    ['Packing', line.packing || ''],
  ];
}
