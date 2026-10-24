import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { formatDate } from '../utils/format.js';

/**
 * Will the order make marketing's EDD [server: services/deliveryRisk.service.js]: the work still
 * to do, model by model and team by team, against the days left — an order of several models is
 * flagged well before one of one model. One look on every screen that shows an order.
 */
export const DELIVERY_TONE = {
  late: { chip: 'bg-danger-500/15 text-danger-400', edge: 'border-danger-500/50', left: 'border-l-danger-500', dot: 'bg-danger-500', label: 'Past EDD' },
  will_miss: { chip: 'bg-danger-500/15 text-danger-400', edge: 'border-danger-500/50', left: 'border-l-danger-500', dot: 'bg-danger-500', label: 'Will miss EDD' },
  at_risk: { chip: 'bg-orange-500/15 text-orange-400', edge: 'border-orange-500/50', left: 'border-l-orange-500', dot: 'bg-orange-500', label: 'May miss EDD' },
  watch: { chip: 'bg-warn-500/15 text-warn-400', edge: 'border-warn-500/50', left: 'border-l-warn-500', dot: 'bg-warn-500', label: 'Watch' },
  on_track: { chip: 'bg-success-500/15 text-success-400', edge: 'border-success-500/40', left: 'border-l-success-500', dot: 'bg-success-500', label: 'On track' },
};
export const DELIVERY_ORDER = ['late', 'will_miss', 'at_risk', 'watch', 'on_track'];
/** In danger: past it, will miss it, may miss it, or in the warning window. */
export const inDanger = (risk) => ['late', 'will_miss', 'at_risk', 'watch'].includes(risk?.level);

/** The chip: the reading in two words, the reasons on hover. Nothing without a reading. `compact`: the words alone, for a table cell. */
export function DeliveryBadge({ risk, className = '', compact = false }) {
  const tone = DELIVERY_TONE[risk?.level];
  if (!tone) return null;
  const models = risk.models > 1 && !compact ? ` · ${risk.modelsLeft}/${risk.models} models` : '';
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${tone.chip} ${className}`}
      title={[risk.why, ...(risk.reasons || [])].filter(Boolean).join('\n')}
      aria-label={`Delivery: ${tone.label}${risk.why ? ` — ${risk.why}` : ''}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {tone.label}{models}
    </span>
  );
}

/** The reading whole, for the enquiry page: the chip, the sentence, what it rests on. */
export function DeliveryReading({ risk, className = '' }) {
  const tone = DELIVERY_TONE[risk?.level];
  if (!tone) return null;
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone.edge} ${className}`} aria-label="Delivery risk">
      <p className="flex flex-wrap items-center gap-2 text-sm text-steel-100">
        <DeliveryBadge risk={risk} />
        <span>{risk.why}</span>
      </p>
      {risk.reasons?.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-steel-400">
          {risk.reasons.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {risk.finish && risk.level !== 'late' && (
        <p className="mt-1 text-xs text-steel-400">
          Plant’s likely finish at its usual pace: {formatDate(risk.finish)}
          {risk.watchFrom && risk.level === 'on_track' ? ` · watched from ${formatDate(risk.watchFrom)}` : ''}
        </p>
      )}
    </div>
  );
}

/**
 * The orders in danger of missing their EDD, worst first [server: GET /production/at-risk] —
 * on the Production and marketing desks and the overview. Hidden when nothing is in danger.
 */
export function DeliveryRiskPanel({ title = 'Orders at risk of missing the EDD', limit = 8 }) {
  const [data, setData] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    productionApi.atRisk().then((answer) => { if (live) setData(answer); }).catch(() => { if (live) setData({ data: [] }); });
    return () => { live = false; };
  }, []);
  const rows = data?.data || [];
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <section className="card space-y-2 p-4" aria-label="Orders at risk">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-steel-300">{title} <span className="font-normal normal-case tabular-nums text-steel-500">{rows.length}</span></h2>
        <p className="text-xs text-steel-500">From the work left on every model and the plant’s usual pace — more models, earlier warning.</p>
      </div>
      <ul className="divide-y divide-line/[0.06]">
        {shown.map((row) => (
          <li key={row.enquiry._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <Link to={`/enquiries/${row.enquiry._id}`} className="font-bold text-steel-50 hover:text-accent">{row.enquiry.number}</Link>
            <span className="min-w-0 truncate text-steel-300">{row.enquiry.customer || '—'}</span>
            <span className="tabular-nums text-steel-400">EDD {formatDate(row.edd)}</span>
            <DeliveryBadge risk={row.risk} />
            <span className="w-full text-xs text-steel-400 sm:w-auto sm:flex-1">{row.risk.why}</span>
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <button type="button" className="link-muted text-xs" onClick={() => setAll((value) => !value)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>
      )}
    </section>
  );
}
