import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { qcRecordsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Facts, FormError, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import useQualityOptions from '../hooks/useQualityOptions.js';
import { formatDate, formatNumber } from '../utils/format.js';
import {
  MOULDING_TYPES, PRINT_TYPES, QC_STAGES, QC_VERDICTS, RESULT, labelOf, toneOf,
} from '../utils/records.js';

/**
 * One QC record [server: records.service]: what was made and of what, every test with what was
 * needed beside what was found, the sample, the verdict — and the sign-off, which is someone else's
 * than the inspector's. The test report the buyer gets is the same sheet as a PDF.
 */

const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function TestRow({ name, found, needed, result }) {
  if (!found && !needed && (!result || result === 'not_tested')) return null;
  const shown = RESULT[result] || RESULT.not_tested;
  return (
    <tr>
      <td className="py-2 pr-3 font-semibold text-steel-100">{name}</td>
      <td className="py-2 pr-3 tabular-nums text-steel-200">{found || '—'}</td>
      <td className="py-2 pr-3 tabular-nums text-steel-400">{needed || ''}</td>
      <td className="py-2 text-right"><Badge tone={shown.tone}>{shown.label}</Badge></td>
    </tr>
  );
}

export default function QcRecordDetail() {
  const { id } = useParams();
  const { user, canWrite } = useAuth();
  const { defectLabel } = useQualityOptions();
  const fetch = useCallback((recordId) => qcRecordsApi.get(recordId), []);
  const { data: record, loading, error, reload } = useRecord(fetch, id);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  if (loading) return <Spinner label="Loading the QC record" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!record) return null;

  const mine = String(record.inspectedBy?._id || record.inspectedBy) === String(user?.id || user?._id);
  const mayApprove = canWrite('quality') && !record.approvedAt && !mine;
  const approve = async () => {
    setBusy(true);
    setProblem(null);
    try { await qcRecordsApi.approve(record._id); await reload(); } catch (failure) { setProblem(failure); } finally { setBusy(false); }
  };
  const { breaking = {}, hangLoad = {}, hook = {}, clip = {}, print = {}, weight = {}, drop = {}, colourMatch = {}, resin = {} } = record;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={record.number}
        subtitle={`${labelOf(QC_STAGES, record.stage)} check · ${when(record.inspectedAt)} · ${record.inspectedBy?.name || ''}`}
        actions={(
          <>
            <button type="button" className="btn-secondary" onClick={() => qcRecordsApi.certificate(record)}>Download test report</button>
            {mayApprove && <button type="button" className="btn-primary" disabled={busy} onClick={approve}>{busy ? 'Approving…' : 'Approve'}</button>}
            <Badge tone={toneOf(QC_VERDICTS, record.verdict)}>{labelOf(QC_VERDICTS, record.verdict)}</Badge>
          </>
        )}
      />
      {problem && <FormError error={problem} />}
      {record.failedTests?.length > 0 && <Notice tone="danger">Failed: {record.failedTests.join(', ')}</Notice>}
      {!record.approvedAt && mine && canWrite('quality') && <Notice tone="warn">Waiting for approval — someone other than you signs it off.</Notice>}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <Section title="Tests">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="text-left text-xs text-steel-400"><th className="pb-2 font-semibold">Test</th><th className="pb-2 font-semibold">Found</th><th className="pb-2 font-semibold">Needed</th><th className="pb-2 text-right font-semibold">Result</th></tr></thead>
                <tbody className="divide-y divide-line/[0.06]">
                  <TestRow
                    name="Breaking strength"
                    found={breaking.samplesKg?.length ? `min ${breaking.minKg} · avg ${breaking.avgKg} · max ${breaking.maxKg} kgf (${breaking.samplesKg.length})` : ''}
                    needed={breaking.requiredKg != null ? `≥ ${breaking.requiredKg} kgf` : ''}
                    result={breaking.result}
                  />
                  <TestRow name="Hang load" found={hangLoad.loadKg != null ? `${hangLoad.loadKg} kg, ${hangLoad.hours ?? '—'} h → ${hangLoad.deflectionMm ?? '—'} mm` : ''} needed={hangLoad.allowedDeflectionMm != null ? `≤ ${hangLoad.allowedDeflectionMm} mm` : ''} result={hangLoad.result} />
                  <TestRow name="Hook pull" found={hook.pullActualKg != null ? `${hook.pullActualKg} kgf` : ''} needed={hook.pullRequiredKg != null ? `≥ ${hook.pullRequiredKg} kgf` : ''} result={hook.result} />
                  <TestRow name="Clip grip" found={clip.gripActualKg != null ? `${clip.gripActualKg} kgf` : ''} needed={clip.gripRequiredKg != null ? `≥ ${clip.gripRequiredKg} kgf` : ''} result={clip.result} />
                  <TestRow name="Weight" found={weight.actual != null ? `${weight.actual} g` : ''} needed={weight.target != null ? `${weight.target} ± ${weight.tolerance ?? 0} g` : ''} result={weight.result} />
                  {(record.measurements || []).map((row) => (
                    <TestRow key={row.name} name={row.name} found={row.actual != null ? `${row.actual} ${row.unit || ''}` : ''} needed={row.target != null ? `${row.target} ± ${row.tolerance ?? 0} ${row.unit || ''}` : ''} result={row.result} />
                  ))}
                  <TestRow name="Print adhesion" needed={print.adhesion && print.adhesion !== 'not_tested' ? 'tape test' : ''} result={print.adhesion} />
                  <TestRow name="Print position" result={print.registration} />
                  <TestRow name="Drop" found={drop.heightCm != null ? `${drop.heightCm} cm × ${drop.drops ?? 1}` : ''} result={drop.result} />
                  <TestRow name="Colour match" needed={colourMatch.against ? `against ${colourMatch.against}` : ''} result={colourMatch.result} />
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Sample and verdict">
            <Facts
              items={[
                { label: 'Lot size', value: record.lotSize != null ? formatNumber(record.lotSize) : null },
                { label: 'Checked', value: record.sampleSize != null ? `${formatNumber(record.sampleSize)} · ${formatNumber(record.accepted ?? 0)} accepted · ${formatNumber(record.rejected || 0)} rejected` : null },
                { label: 'Defects', value: (record.defects || []).map((row) => `${defectLabel(row.type)} × ${row.count}`).join(', '), wide: true },
                { label: 'Verdict', value: labelOf(QC_VERDICTS, record.verdict) },
                { label: 'Approved', value: record.approvedAt ? `${record.approvedBy?.name || ''} · ${when(record.approvedAt)}` : 'Not yet' },
                { label: 'Remarks', value: record.remarks, wide: true },
              ]}
            />
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="What was made">
            <Facts
              columns={1}
              items={[
                { label: 'Buyer', value: record.customer?.name },
                { label: 'Sales order', value: record.order ? <Link to={`/orders/${record.order._id}`} className="font-semibold text-steel-100 hover:text-accent">{record.order.number}{record.order.customerPo?.number ? ` · PO ${record.order.customerPo.number}` : ''}</Link> : null },
                { label: 'Enquiry', value: record.enquiry ? <Link to={`/enquiries/${record.enquiry._id}`} className="font-semibold text-steel-100 hover:text-accent">{record.enquiry.number}</Link> : null },
                { label: 'Mould', value: record.mould ? <Link to={`/moulds/${record.mould._id}`} className="font-semibold text-steel-100 hover:text-accent">{record.mould.mouldCode} — {record.mould.name}</Link> : null },
                { label: 'Model · size', value: [record.modelNumber, record.size].filter(Boolean).join(' · ') },
                { label: 'Moulding', value: record.mouldingType && labelOf(MOULDING_TYPES, record.mouldingType) },
                { label: 'Cavities', value: record.cavities },
                { label: 'Machine', value: record.machine ? <Link to={`/machines/${record.machine._id}`} className="font-semibold text-steel-100 hover:text-accent">{record.machine.code}{record.machine.name ? ` — ${record.machine.name}` : ''}</Link> : null },
                { label: 'Shift · operator', value: [record.shift && (record.shift === 'General' ? 'General' : `Shift ${record.shift}`), record.operator].filter(Boolean).join(' · ') },
                { label: 'Produced on', value: record.producedOn && formatDate(record.producedOn) },
                { label: 'Run', value: record.run?.number },
                { label: 'Quality task', value: record.task?.title },
              ]}
            />
          </Section>
          <Section title="Resin, hook, clips, print">
            <Facts
              columns={1}
              items={[
                { label: 'Resin', value: [resin.material?.name || resin.name, resin.grade, resin.colour].filter(Boolean).join(' · ') },
                { label: 'Batch · supplier', value: [resin.batch, resin.supplier].filter(Boolean).join(' · ') },
                { label: 'Masterbatch', value: resin.masterbatch && `${resin.masterbatch}${resin.masterbatchPercent != null ? ` · ${resin.masterbatchPercent}%` : ''}` },
                { label: 'Regrind', value: resin.regrindPercent != null ? `${resin.regrindPercent}%` : null },
                { label: 'Hook', value: [hook.type, hook.finish].filter(Boolean).join(' · ') },
                { label: 'Clips', value: clip.type },
                { label: 'Print', value: print.type && [labelOf(PRINT_TYPES, print.type), print.colour, print.artwork].filter(Boolean).join(' · ') },
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}
