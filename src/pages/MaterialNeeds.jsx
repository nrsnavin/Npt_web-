import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { Badge, EmptyState, ErrorState, PageHeader, Section, TableSkeleton } from '../components/ui.jsx';
import { formatNumber } from '../utils/format.js';

const KIND = { material: 'Resin', hook: 'Hook', clip: 'Clip' };
const linkOf = (item) => (item.kind === 'material' ? `/materials/${item.ref}` : `/${item.kind === 'hook' ? 'hooks' : 'clips'}/${item.ref}`);

/**
 * What the plan needs from the stores [server: bom.service `shortages`]: for each resin, hook and
 * clip the open work orders use, what they need, what is on hand, what is short and what to buy
 * to stand back at the reorder level — and which work orders will run short, in plan order.
 */
export default function MaterialNeeds() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => productionApi.shortages().then((value) => { setData(value); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  const short = (data?.items || []).filter((item) => item.short > 0 || item.buy > 0);
  const jobs = Object.entries(data?.byWorkOrder || {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Material needs"
        subtitle="What the open work orders need from the stores, what is short, and what to buy."
        actions={<Link to="/production/plan" className="btn-secondary">Planning board</Link>}
      />
      {error && <ErrorState error={error} onRetry={load} />}
      {!data && !error && <TableSkeleton rows={6} columns={6} />}
      {data && (
        <>
          {short.length === 0 && data.items.length > 0 && <p className="text-sm text-success-400">The stores hold everything the open work orders need.</p>}
          <Section title="By item">
            {data.items.length === 0 ? (
              <EmptyState title="Nothing to work out yet" description="Work orders need a resin, hook or clip on their order line to be counted here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-right">Needed</th>
                      <th className="px-3 py-2 text-right">On hand</th>
                      <th className="px-3 py-2 text-right">Short</th>
                      <th className="px-3 py-2 text-right">Buy</th>
                      <th className="px-3 py-2 text-left">Supplier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/[0.04]">
                    {data.items.map((item) => (
                      <tr key={`${item.kind}:${item.ref}`}>
                        <td className="px-3 py-2"><Link to={linkOf(item)} className="font-semibold text-steel-100 hover:text-accent">{item.name}</Link><span className="ml-2 text-xs text-steel-500">{KIND[item.kind]}</span></td>
                        <td className="px-3 py-2 text-right tabular-nums text-steel-200">{formatNumber(item.required)} {item.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-steel-200">{formatNumber(item.onHand)} {item.unit}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${item.short ? 'font-bold text-danger-400' : 'text-steel-500'}`}>{item.short ? `${formatNumber(item.short)} ${item.unit}` : '—'}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${item.buy ? 'font-semibold text-warn-400' : 'text-steel-500'}`}>{item.buy ? `${formatNumber(item.buy)} ${item.unit}` : '—'}</td>
                        <td className="px-3 py-2 text-steel-400">{item.supplier || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
          {jobs.length > 0 && (
            <Section title="Work orders that will run short">
              <ul className="space-y-2 text-sm">
                {jobs.map(([id, job]) => (
                  <li key={id} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-semibold text-steel-100">{job.number}</span>
                    {job.machine && <Badge tone="info">{job.machine}</Badge>}
                    <span className="text-steel-400">{job.short.map((item) => `${item.name}: ${formatNumber(item.short)} ${item.unit} short`).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {data.unnamedMaterial?.length > 0 && (
            <Section title="No resin named on the order line">
              <p className="mb-2 text-xs text-steel-400">These work orders cannot be counted for resin until their order line names the material.</p>
              <p className="text-sm text-steel-300">{data.unnamedMaterial.map((job) => `${job.number}${job.modelNumber ? ` (${job.modelNumber})` : ''}`).join(' · ')}</p>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
