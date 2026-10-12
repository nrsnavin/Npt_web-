import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { formatDate, formatNumber, humanise } from '../utils/format.js';

const rupees = (value) => (value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`);

/**
 * What this mould in this material was quoted at before [server: quotation.controller
 * `previousQuotes`], shown on the costing sheet once both are picked: first the same item — same
 * hook and clips — then the same mould and material with other parts. Each names its hook, clips,
 * print and packing, so a difference in price can be read off a difference in parts.
 */
export default function PreviousQuotes({ mould, material, hook, clip, exclude }) {
  const [found, setFound] = useState(null);

  useEffect(() => {
    if (!mould || !material) {
      setFound(null);
      return undefined;
    }
    let live = true;
    setFound(undefined);
    quotationsApi.previous({ mould, material, hook: hook || undefined, clip: clip || undefined, exclude })
      .then((data) => live && setFound(data))
      .catch(() => live && setFound({ same: [], similar: [] }));
    return () => {
      live = false;
    };
  }, [mould, material, hook, clip, exclude]);

  if (!mould || !material) return null;

  return (
    <section aria-label="Quoted before" className="rounded-xl border border-line/[0.1] bg-line/[0.02] p-3.5">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-steel-400">Quoted before — this mould in this material</p>
      {found === undefined && <p className="mt-2 text-xs text-steel-500">Looking…</p>}
      {found && !found.same.length && !found.similar.length && (
        <p className="mt-2 text-xs text-steel-500">Not quoted before in this combination.</p>
      )}
      {found?.same?.length > 0 && <Group title="Same hook and clips" rows={found.same} />}
      {found?.similar?.length > 0 && <Group title={found.same.length ? 'Same mould and material, other parts' : 'Same mould and material'} rows={found.similar} />}
    </section>
  );
}

function Group({ title, rows }) {
  return (
    <div className="mt-2.5">
      <p className="text-xs font-semibold text-steel-300">{title}</p>
      <ul className="mt-1.5 space-y-2">
        {rows.map((row) => (
          <li key={`${row.quotation}-${row.modelNumber}-${row.price}`} className="rounded-lg border border-line/[0.08] px-3 py-2 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-steel-200">
                <Link to={`/quotations/${row.quotation}`} target="_blank" rel="noreferrer" className="font-semibold text-steel-50 hover:text-accent">{row.number}</Link>
                {row.customer ? ` · ${row.customer}` : ''}
                {` · ${formatDate(row.at)} · ${humanise(row.status)}`}
              </p>
              <p className="font-bold tabular-nums text-flame-400">
                {rupees(row.price)}/pc
                {row.cost != null && <span className="ml-2 font-normal text-steel-400">cost {rupees(row.cost)}</span>}
              </p>
            </div>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-steel-400">
              <dt>Item</dt>
              <dd className="text-steel-200">{[row.modelNumber, row.material, row.colour, row.quantity ? `${formatNumber(row.quantity)} pcs` : null].filter(Boolean).join(' · ')}</dd>
              <dt>Hook</dt>
              <dd className="text-steel-200">{row.hook || 'None'}</dd>
              <dt>Clips</dt>
              <dd className="text-steel-200">{row.clip || 'None'}</dd>
              <dt>Print</dt>
              <dd className="text-steel-200">{[row.print, row.printing].filter(Boolean).join(' · ') || 'None'}</dd>
              <dt>Packing</dt>
              <dd className="text-steel-200">{[row.packing, row.packingCost ? `${rupees(row.packingCost)}/pc` : null].filter(Boolean).join(' · ') || 'Not stated'}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
