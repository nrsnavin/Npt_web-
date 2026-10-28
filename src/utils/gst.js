/**
 * The GST on a sales order's lines, worked out the way the server does [server: utils/gst.js
 * `taxOn`] — so the order form can say the total before it is saved: each line's taxable value
 * and tax at its own rate (else the order's), the sums, and the invoice total rounded to the
 * rupee with the round-off said on its own. A quotation carries no tax: it is a rate, "GST extra".
 */
const round2 = (value) => Math.round(value * 100) / 100;
const num = (value) => (value === '' || value == null || Number.isNaN(Number(value)) ? null : Number(value));

export function taxOn({ lines = [], gstPercent, isExport = false } = {}) {
  const orderRate = num(gstPercent) ?? 0;
  const rows = lines.map((line) => {
    const taxable = round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
    const rate = isExport ? 0 : num(line.gstPercent) ?? orderRate;
    const tax = round2((taxable * rate) / 100);
    return { taxable, gstPercent: rate, tax, total: round2(taxable + tax) };
  });
  const sum = (key) => round2(rows.reduce((total, row) => total + row[key], 0));
  const taxable = sum('taxable');
  const tax = sum('tax');
  const gross = round2(taxable + tax);
  const total = Math.round(gross);
  return { lines: rows, taxable, tax, gross, roundOff: round2(total - gross), total, rates: [...new Set(rows.map((row) => row.gstPercent))].sort((a, b) => a - b) };
}

/** "GST 18%", or "GST 12% / 18%" when the lines differ. */
export const ratesWords = (rates = []) => (rates.length ? `GST ${rates.map((rate) => `${rate}%`).join(' / ')}` : 'GST');
