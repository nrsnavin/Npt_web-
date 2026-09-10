import { useCallback, useEffect, useState } from 'react';
import { quality as qualityApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Modal, Notice, Section } from './ui.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { inspectionStageLabel, verdictLabel, verdictTone } from '../utils/pipeline.js';

/**
 * What quality found on this order [§15].
 *
 * Two things on one panel, because the reader needs both and they are not the same question.
 * **What is true now** — the standing verdict per line, and whether anything is held — sits at
 * the top, because a supervisor opening this wants to know whether they can ship. **What
 * happened** sits under it, because when the answer is "no" the next question is always why.
 *
 * The unit is the line throughout, never the order. A two-model order is inspected twice, on
 * different days, with different results, and "the order passed" is the sentence that ships a
 * bad model beside a good one.
 */

/* The words themselves live in pipeline.js, where every other stage vocabulary does — three
   more screens needed them and a list written twice eventually disagrees with itself. */
const VERDICT_TONE = {
  success: 'text-success-400',
  warn: 'text-warn-400',
  danger: 'text-danger-400',
};

/** One line's standing verdict — the "can we ship this" answer, per model. */
function LineState({ row }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        row.held ? 'border-danger-500/40 bg-danger-500/[0.04]' : 'border-line/[0.08]'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-semibold text-steel-100">{row.modelNumber || 'Unnamed model'}</p>
        {row.latestVerdict ? (
          <p className={`text-sm font-bold ${VERDICT_TONE[verdictTone(row.latestVerdict)] || 'text-steel-300'}`}>
            {verdictLabel(row.latestVerdict)}
          </p>
        ) : (
          <p className="text-sm text-steel-400">Not inspected</p>
        )}
      </div>

      {row.inspections > 0 && (
        <p className="mt-1 text-xs text-steel-400">
          {row.inspections} {row.inspections === 1 ? 'inspection' : 'inspections'} ·{' '}
          {formatNumber(row.rejected)} rejected of {formatNumber(row.inspected)} checked
        </p>
      )}
      {/* Said in words as well as by the red edge: a colour alone means nothing to somebody who
          has not been told the convention. */}
      {row.held && (
        <p className="mt-1 text-sm font-bold text-danger-400">Held — this line cannot ship</p>
      )}
    </div>
  );
}

function InspectionRow({ inspection }) {
  return (
    <li className="border-t border-line/[0.06] py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-semibold text-steel-100">
          {inspection.modelNumber || 'Unnamed model'}
          <span className="ml-2 text-xs font-normal text-steel-400">
            {inspectionStageLabel(inspection.stage)}
          </span>
        </p>
        <p className={`text-sm font-bold ${VERDICT_TONE[verdictTone(inspection.verdict)] || 'text-steel-300'}`}>
          {verdictLabel(inspection.verdict)}
        </p>
      </div>

      <p className="mt-1 text-sm text-steel-300">
        {formatNumber(inspection.quantityRejected)} rejected of{' '}
        {formatNumber(inspection.quantityInspected)} checked
        {inspection.quantityInspected ? ` · ${inspection.rejectionPercent}%` : ''}
      </p>

      {/* The defects, which are the whole reason this is recorded rather than remembered. */}
      {inspection.defects?.length > 0 && (
        <p className="mt-1 text-sm text-steel-200">
          {inspection.defects
            .map((defect) => `${defect.type.replace(/_/g, ' ')} × ${formatNumber(defect.count)}`)
            .join(' · ')}
        </p>
      )}

      {inspection.remarks && <p className="mt-1 text-sm text-steel-300">{inspection.remarks}</p>}

      <p className="mt-1.5 text-xs text-steel-500">
        {inspection.number} · {inspection.inspectedBy?.name} ·{' '}
        {formatDate(inspection.inspectedAt)}
        {inspection.dispatch?.number ? ` · ${inspection.dispatch.number}` : ''}
        {inspection.mould?.mouldCode ? ` · ${inspection.mould.mouldCode}` : ''}
      </p>
    </li>
  );
}

/** Recording one. The form is the defect list — everything else is two numbers and a verdict. */
function InspectionForm({ order, options, onClose, onRecorded }) {
  const { toast } = useToast();
  const firstLine = order.lines?.[0];
  const [values, setValues] = useState({
    line: firstLine?._id || '',
    stage: 'final',
    verdict: 'passed',
    quantityInspected: '',
    quantityRejected: '',
    remarks: '',
  });
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const defects = Object.entries(counts)
        .filter(([, count]) => Number(count) > 0)
        .map(([type, count]) => ({ type, count: Number(count) }));

      onRecorded(
        await qualityApi.record({
          orderId: order._id,
          line: values.line,
          stage: values.stage,
          verdict: values.verdict,
          quantityInspected: Number(values.quantityInspected),
          quantityRejected: Number(values.quantityRejected || 0),
          defects,
          remarks: values.remarks || undefined,
        })
      );
      /* A rejection is not a save, it is a stop — and the person recording it should see that
         said back to them rather than discovering it on the plant's screen later. */
      toast(
        values.verdict === 'rejected'
          ? 'Rejected — this line is held and the plant has been told'
          : `Inspection recorded — ${verdictLabel(values.verdict).toLowerCase()}`,
        Number(values.quantityRejected) > 0
          ? `${formatNumber(Number(values.quantityRejected))} rejected of ${formatNumber(Number(values.quantityInspected))}`
          : undefined
      );
      onClose();
    } catch (recordError) {
      setError(recordError);
    } finally {
      setBusy(false);
    }
  };

  /* Grouped as the model groups them, because that is how a Pareto is read: three of the top
     five being moulding faults points at a press, three being finishing points at the line. */
  const groups = [...new Set((options?.defects || []).map((defect) => defect.group))];

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Which model" hint="A line, never the whole order — they are checked separately">
          <select className="input" value={values.line} onChange={set('line')}>
            {order.lines.map((line) => (
              <option key={line._id} value={line._id}>
                {line.modelNumber || line.mould?.mouldCode || 'Unnamed model'}
                {line.colour ? ` · ${line.colour}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="When">
          <select className="input" value={values.stage} onChange={set('stage')}>
            {(options?.stages || []).map((stage) => (
              <option key={stage.key} value={stage.key}>{stage.label}</option>
            ))}
          </select>
        </Field>

        <Field label="How many checked">
          <input
            type="number" min="1" className="input" required
            value={values.quantityInspected} onChange={set('quantityInspected')}
          />
        </Field>

        <Field label="How many failed">
          <input
            type="number" min="0" className="input"
            value={values.quantityRejected} onChange={set('quantityRejected')}
          />
        </Field>
      </div>

      <Field
        label="What the verdict is"
        hint="Rejecting holds the line and tells the marketing person who owns the order"
      >
        <select className="input" value={values.verdict} onChange={set('verdict')}>
          {(options?.verdicts || []).map((verdict) => (
            <option key={verdict.key} value={verdict.key}>{verdict.label}</option>
          ))}
        </select>
      </Field>

      {/*
        The defect counts. The reason this module exists rather than a pass/fail flag: a count
        against a named fault is what lets a report say which tool is the problem. Counts may sum
        above the reject total — one piece can carry two faults — so nothing here is derived.
      */}
      <div className="space-y-3 rounded-lg border border-line/[0.08] p-3">
        <p className="text-sm text-steel-300">
          What was wrong, and how many. Leave blank what you did not see.
        </p>
        {groups.map((group) => (
          <div key={group}>
            <p className="eyebrow mb-1.5">{group}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.defects
                .filter((defect) => defect.group === group)
                .map((defect) => (
                  <label key={defect.key} className="flex items-center gap-2 text-sm text-steel-200">
                    <input
                      type="number" min="0" className="input w-20 shrink-0"
                      value={counts[defect.key] || ''}
                      onChange={(event) =>
                        setCounts({ ...counts, [defect.key]: event.target.value })
                      }
                      aria-label={defect.label}
                    />
                    <span title={defect.hint}>{defect.label}</span>
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>

      <Field label="Anything else" hint="Especially if you picked “something else” above">
        <textarea rows={2} className="input" value={values.remarks} onChange={set('remarks')} />
      </Field>

      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Recording…' : 'Record inspection'}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

export default function OrderQuality({ order }) {
  const { canWrite } = useAuth();
  const [state, setState] = useState(null);
  const [options, setOptions] = useState(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);

  const mayInspect = canWrite('quality');

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await qualityApi.onOrder(order._id));
    } catch (loadError) {
      setError(loadError);
    }
  }, [order._id]);

  useEffect(() => {
    load();
  }, [load]);

  /* Fetched once, and only when somebody may actually record — the vocabulary is the server's,
     so a form can never offer a defect the reports do not know about. */
  useEffect(() => {
    if (!mayInspect || options) return;
    qualityApi.options().then(setOptions).catch(() => {});
  }, [mayInspect, options]);

  if (error) return null;

  const inspections = state?.data || [];
  const lines = state?.lines || [];
  const held = lines.filter((row) => row.held);

  return (
    <Section
      title="Quality"
      actions={
        mayInspect && options ? (
          <button type="button" className="row-action" onClick={() => setRecording(true)}>
            Record an inspection
          </button>
        ) : null
      }
    >
      {held.length > 0 && (
        <Notice tone="danger">
          <p>
            {held.length === 1
              ? `${held[0].modelNumber || 'A line'} is held on quality and cannot ship.`
              : `${held.length} lines are held on quality and cannot ship.`}
          </p>
        </Notice>
      )}

      {/* What is true now, per line — before the history of how it got there. */}
      <div className="mt-3 space-y-2">
        {lines.map((row) => (
          <LineState key={row.line} row={row} />
        ))}
      </div>

      {inspections.length > 0 ? (
        <ul className="mt-4">
          {inspections.map((inspection) => (
            <InspectionRow key={inspection._id} inspection={inspection} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-steel-400">
          Nothing has been inspected on this order yet. An inspection here records what was
          checked and what was wrong with it, so the reports can say which tool is making scrap.
        </p>
      )}

      <Modal
        open={recording}
        title="Record an inspection"
        subtitle="Against one model on this order — they are checked separately"
        onClose={() => setRecording(false)}
      >
        {options && (
          <InspectionForm
            order={order}
            options={options}
            onClose={() => setRecording(false)}
            onRecorded={load}
          />
        )}
      </Modal>
    </Section>
  );
}
