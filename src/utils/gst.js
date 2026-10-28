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

/** The state a GSTIN begins with [server: utils/gst.js `GST_STATES`] — "29" is Karnataka. */
export const GST_STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const stateOfGstin = (gstin) => GST_STATES[String(gstin || '').trim().slice(0, 2)] || null;
/** A buyer with neither a state nor a GSTIN on record: the GST on their orders assumes the plant's own state. */
export const gstUnknown = (customer) => !String(customer?.state || '').trim() && !String(customer?.gstin || '').trim();
