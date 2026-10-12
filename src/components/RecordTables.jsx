import { Link } from 'react-router-dom';
import { Badge } from './ui.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { MAINTENANCE_TYPES, QC_STAGES, QC_VERDICTS, RUN_STATUSES, labelOf, toneOf } from '../utils/records.js';

/**
 * The history tables a machine and a mould share: maintenance, runs, QC records. One copy, so the
 * machine's page and the mould's read the same way.
 */

const Empty = ({ children }) => <p className="text-sm text-steel-400">{children}</p>;

export function MaintenanceTable({ rows, showAsset = false, empty }) {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="text-left text-xs text-steel-400">
          <th className="pb-2 pr-3 font-semibold">Date</th>
          {showAsset && <th className="pb-2 pr-3 font-semibold">On</th>}
          <th className="pb-2 pr-3 font-semibold">Work</th>
          <th className="pb-2 pr-3 font-semibold">What was done</th>
          <th className="pb-2 pr-3 text-right font-semibold">Down</th>
          <th className="pb-2 text-right font-semibold">Cost</th>
        </tr></thead>
        <tbody className="divide-y divide-line/[0.06] align-top">
          {rows.map((row) => (
            <tr key={row._id}>
              <td className="whitespace-nowrap py-2 pr-3 text-steel-300">{formatDate(row.doneOn)}<p className="text-xs text-steel-500">{row.number}</p></td>
              {showAsset && (
                <td className="py-2 pr-3 text-steel-200">
                  {row.asset === 'mould'
                    ? <Link to={`/moulds/${row.mould?._id}`} className="hover:text-accent">Mould {row.mould?.mouldCode}</Link>
                    : `Machine ${row.machine?.code || ''}`}
                </td>
              )}
              <td className="py-2 pr-3 text-steel-200">{labelOf(MAINTENANCE_TYPES, row.type)}</td>
              <td className="py-2 pr-3 text-steel-200">
                {row.problem && <p className="text-xs text-danger-400">{row.problem}</p>}
                <p>{row.workDone}</p>
                {row.parts?.length > 0 && <p className="text-xs text-steel-500">Spares: {row.parts.map((part) => `${part.name}${part.quantity ? ` × ${part.quantity}` : ''}`).join(', ')}</p>}
                <p className="text-xs text-steel-500">{[row.doneBy, row.vendor, row.onMachine?.code && `on ${row.onMachine.code}`, row.shotCount != null && `at ${formatNumber(row.shotCount)} shots`].filter(Boolean).join(' · ')}</p>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-steel-300">{row.downtimeHours ? `${row.downtimeHours} h` : '—'}</td>
              <td className="py-2 text-right tabular-nums text-steel-300">{row.totalCost ? `₹${formatNumber(row.totalCost)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RunsTable({ rows, showMould = false, showMachine = false, empty, actions }) {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="text-left text-xs text-steel-400">
          <th className="pb-2 pr-3 font-semibold">Run</th>
          {showMould && <th className="pb-2 pr-3 font-semibold">Mould</th>}
          {showMachine && <th className="pb-2 pr-3 font-semibold">Machine</th>}
          <th className="pb-2 pr-3 font-semibold">For</th>
          <th className="pb-2 pr-3 text-right font-semibold">Shots</th>
          <th className="pb-2 pr-3 text-right font-semibold">Good · rejected</th>
          <th className="pb-2 pr-3 font-semibold">Status</th>
          {actions && <th className="pb-2" />}
        </tr></thead>
        <tbody className="divide-y divide-line/[0.06] align-top">
          {rows.map((run) => (
            <tr key={run._id}>
              <td className="py-2 pr-3"><span className="font-semibold text-steel-100">{run.number}</span><p className="text-xs text-steel-500">{formatDate(run.startedAt)}{run.shift ? ` · Shift ${run.shift}` : ''}{run.operator ? ` · ${run.operator}` : ''}</p></td>
              {showMould && <td className="py-2 pr-3"><Link to={`/moulds/${run.mould?._id}`} className="text-steel-200 hover:text-accent">{run.mould?.mouldCode}</Link></td>}
              {showMachine && <td className="py-2 pr-3">{run.machine ? <Link to={`/machines/${run.machine._id}`} className="text-steel-200 hover:text-accent">{run.machine.code}</Link> : '—'}</td>}
              <td className="py-2 pr-3 text-steel-200">{run.customer?.name || '—'}{run.enquiry?.number && <p className="text-xs text-steel-500">{run.enquiry.number}{run.colour ? ` · ${run.colour}` : ''}</p>}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-steel-200">{run.shots != null ? formatNumber(run.shots) : '—'}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-steel-200">
                {run.goodPieces != null ? formatNumber(run.goodPieces) : '—'} · {run.rejectedPieces != null ? formatNumber(run.rejectedPieces) : '—'}
                {run.rejectPercent != null && <p className="text-xs text-steel-500">{run.rejectPercent}% rejected</p>}
              </td>
              <td className="py-2 pr-3">
                <Badge tone={toneOf(RUN_STATUSES, run.status)}>{labelOf(RUN_STATUSES, run.status)}</Badge>
                {run.downtimeMinutes ? <p className="mt-1 text-xs text-steel-500">{run.downtimeMinutes} min stopped{run.downtimeReason ? ` — ${run.downtimeReason}` : ''}</p> : null}
              </td>
              {actions && <td className="py-2 text-right">{actions(run)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QcTable({ rows, empty }) {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-line/[0.06] text-sm">
      {rows.map((row) => (
        <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>
            <Link to={`/qc-records/${row._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.number}</Link>
            <span className="text-steel-400"> · {labelOf(QC_STAGES, row.stage)} · {formatDate(row.inspectedAt)}</span>
            {row.breaking?.minKg != null && <span className="text-steel-400"> · breaking {row.breaking.minKg} kgf min</span>}
          </span>
          <Badge tone={toneOf(QC_VERDICTS, row.verdict)}>{labelOf(QC_VERDICTS, row.verdict)}</Badge>
        </li>
      ))}
    </ul>
  );
}
