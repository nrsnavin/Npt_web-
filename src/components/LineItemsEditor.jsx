import { useMemo } from 'react';
import { formatCurrency } from '../utils/format.js';

const emptyLine = (itemKey) => ({
  [itemKey]: '',
  quantity: 1,
  unitPrice: 0,
  discountPercent: 0,
  taxPercent: 18,
});

/**
 * Editable document lines with a live total, shared by quotations, sales orders
 * and purchase orders. `itemKey` is 'product' or 'material' depending on the document.
 */
export default function LineItemsEditor({
  lines,
  onChange,
  items = [],
  itemKey = 'product',
  itemLabel = 'Product',
  priceField = 'unitPrice',
}) {
  const itemById = useMemo(() => new Map(items.map((item) => [item._id, item])), [items]);

  const updateLine = (index, patch) => {
    const next = lines.map((line, position) => (position === index ? { ...line, ...patch } : line));
    onChange(next);
  };

  const handleItemChange = (index, id) => {
    const item = itemById.get(id);
    updateLine(index, {
      [itemKey]: id,
      // Pull the catalogue price and tax rate across so the user rarely has to type them.
      ...(item
        ? {
            unitPrice: Number(item[priceField] ?? item.unitPrice ?? item.standardCost ?? 0),
            taxPercent: Number(item.taxPercent ?? 18),
          }
        : {}),
    });
  };

  const totals = lines.reduce(
    (accumulator, line) => {
      const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
      const discount = (gross * (Number(line.discountPercent) || 0)) / 100;
      const taxable = gross - discount;
      const tax = (taxable * (Number(line.taxPercent) || 0)) / 100;
      return {
        subtotal: accumulator.subtotal + taxable,
        tax: accumulator.tax + tax,
        total: accumulator.total + taxable + tax,
      };
    },
    { subtotal: 0, tax: 0, total: 0 }
  );

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2">{itemLabel}</th>
              <th className="w-24 px-3 py-2 text-right">Qty</th>
              <th className="w-28 px-3 py-2 text-right">Rate</th>
              <th className="w-24 px-3 py-2 text-right">Disc %</th>
              <th className="w-24 px-3 py-2 text-right">Tax %</th>
              <th className="w-32 px-3 py-2 text-right">Amount</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, index) => {
              const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
              const discount = (gross * (Number(line.discountPercent) || 0)) / 100;
              const taxable = gross - discount;
              const amount = taxable * (1 + (Number(line.taxPercent) || 0) / 100);

              return (
                <tr key={index}>
                  <td className="px-3 py-2">
                    <select
                      className="input"
                      value={line[itemKey] || ''}
                      onChange={(event) => handleItemChange(index, event.target.value)}
                      required
                    >
                      <option value="">Select {itemLabel.toLowerCase()}…</option>
                      {items.map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.sku || item.code} — {item.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="input text-right"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="input text-right"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      className="input text-right"
                      value={line.discountPercent}
                      onChange={(event) => updateLine(index, { discountPercent: event.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="input text-right"
                      value={line.taxPercent}
                      onChange={(event) => updateLine(index, { taxPercent: event.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(amount)}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={() => onChange(lines.filter((_, position) => position !== index))}
                      disabled={lines.length === 1}
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onChange([...lines, emptyLine(itemKey)])}
        >
          + Add line
        </button>

        <dl className="min-w-[16rem] space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Taxable value</dt>
            <dd className="font-medium">{formatCurrency(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Tax</dt>
            <dd className="font-medium">{formatCurrency(totals.tax)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base">
            <dt className="font-semibold text-slate-700">Total</dt>
            <dd className="font-semibold text-slate-900">{formatCurrency(totals.total)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export { emptyLine };
