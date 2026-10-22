/** The SO desk's words for a request's size [components/SoDesk.jsx]: "2 models · 15,000 pcs · ₹39,500". */
export const rupeesOf = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
export const piecesOf = (value) => `${Number(value || 0).toLocaleString('en-IN')} pcs`;
export const sizeWords = (size = {}) => [
  size.models ? `${size.models} model${size.models > 1 ? 's' : ''}` : null,
  size.pieces ? piecesOf(size.pieces) : null,
  size.value ? rupeesOf(size.value) : null,
].filter(Boolean).join(' · ');
