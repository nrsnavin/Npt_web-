import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { orders as ordersApi, qcRecordsApi } from '../api/endpoints.js';
import { Badge, Field, FormError, PageHeader, Section } from '../components/ui.jsx';
import { EnquirySelect, MaterialSelect, MouldSelect } from '../components/pickers.jsx';
import MachineSelect from '../components/MachineSelect.jsx';
import useQualityOptions from '../hooks/useQualityOptions.js';
import {
  MOULDING_TYPES, PRINT_TYPES, QC_STAGES, QC_VERDICTS, RESULT, SHIFTS, fillFrom, workOut,
} from '../utils/records.js';

/**
 * A new QC record — the test sheet for one lot [server: records.service `createQcRecord`].
 *
 * In the order the bench works: what was made and on what, the resin, the hook, clips and print,
 * the measurements, the strength tests, the sample, then the verdict. Every section but the first
 * and the last can be left empty — an incoming resin check has no hook pull, a first-piece check no
 * lot. Results that follow from the figures are worked out as they are typed and cannot be set
 * against them; the server works them out again and is the one saved.
 *
 * Opened from a Quality task, an SO, an enquiry or a mould, the link carries `task`, `order`,
 * `orderLine`, `enquiry`, `mould`, `run` and `stage` and the form starts with them filled. The SO is
 * offered from the enquiry; left empty, the server ties the sheet to the enquiry's SO.
 */

const MEASURE_PRESETS = ['Width', 'Height', 'Hook height', 'Shoulder thickness', 'Bar gap', 'Neck width'];

const blank = (params) => ({
  stage: params.get('stage') || 'final',
  enquiry: params.get('enquiry') || '',
  task: params.get('task') || '',
  order: params.get('order') || '',
  orderLine: params.get('orderLine') || '',
  run: params.get('run') || '',
  mould: params.get('mould') || '',
  machine: params.get('machine') || '',
  modelNumber: '', size: '', mouldingType: '', cavities: '', shift: '', operator: '', producedOn: '',
  resin: { material: '', name: '', grade: '', batch: '', supplier: '', colour: '', masterbatch: '', masterbatchPercent: '', regrindPercent: '' },
  hook: { type: '', finish: '', pullRequiredKg: '', pullActualKg: '' },
  clip: { type: '', gripRequiredKg: '', gripActualKg: '' },
  print: { type: '', colour: '', artwork: '', adhesion: '', registration: '' },
  weight: { target: '', tolerance: '', actual: '' },
  measurements: [{ name: 'Width', unit: 'mm', target: '', tolerance: '', actual: '' }],
  breaking: { requiredKg: '', samples: '' },
  hangLoad: { loadKg: '', hours: '', deflectionMm: '', allowedDeflectionMm: '' },
  drop: { heightCm: '', drops: '', result: '' },
  colourMatch: { against: '', result: '' },
  lotSize: '', sampleSize: '', rejected: '',
  defects: [],
  verdict: '',
  remarks: '',
});

/** "18, 17.5 19" → [18, 17.5, 19]. Anything that is not a number is dropped. */
export const parseSamples = (text) => String(text || '').split(/[\s,;]+/).filter(Boolean).map(Number).filter((value) => Number.isFinite(value) && value >= 0);

/** Empty strings and empty objects out, so the server sees only what was filled in. */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, inner]) => [key, clean(inner)]).filter(([, inner]) => inner !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value === '' || value === null ? undefined : value;
}

function Result({ value }) {
  if (!value) return null;
  return <Badge tone={RESULT[value].tone}>{RESULT[value].label}</Badge>;
}

/** A number box that keeps '' for empty and a number otherwise. */
function NumberInput({ value, onChange, step = 'any', ...rest }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      className="input"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      {...rest}
    />
  );
}

function PassFail({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {['pass', 'fail'].map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(value === option ? '' : option)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${value === option ? (option === 'pass' ? 'bg-success-500/15 text-success-400 ring-success-500/30' : 'bg-danger-500/15 text-danger-400 ring-danger-500/30') : 'text-steel-300 ring-line/10 hover:bg-line/[0.05]'}`}
        >
          {RESULT[option].label}
        </button>
      ))}
    </div>
  );
}

export default function QcRecordForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { defects: defectTypes } = useQualityOptions();
  const [sheet, setSheet] = useState(() => blank(params));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  /** set('resin.batch')(value) */
  const set = (path) => (value) => setSheet((current) => {
    const next = structuredClone(current);
    const keys = path.split('.');
    let target = next;
    keys.slice(0, -1).forEach((key) => { target = target[key]; });
    target[keys.at(-1)] = value;
    return next;
  });
  const text = (path) => (event) => set(path)(event.target.value);
  const setRow = (list, index, key, value) => setSheet((current) => ({ ...current, [list]: current[list].map((row, at) => (at === index ? { ...row, [key]: value } : row)) }));
  const dropRow = (list, index) => setSheet((current) => ({ ...current, [list]: current[list].filter((_, at) => at !== index) }));

  /* The enquiry's sales orders, to pick which SO — and which line of it — the lot is for. */
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    let live = true;
    if (!sheet.enquiry) { setOrders([]); return undefined; }
    ordersApi.list({ enquiry: sheet.enquiry, limit: 20 })
      .then((answer) => live && setOrders(answer?.data || []))
      .catch(() => live && setOrders([]));
    return () => { live = false; };
  }, [sheet.enquiry]);
  /*
   * The prefill [server: records.service `qcPrefill`]: from the task, enquiry, SO and line (or the
   * enquiry's item before there is an SO), what is known about the lot — buyer, model, size, mould,
   * cavities, moulding type, resin and colour, hook, clips, print, part weight, width and lot size.
   * It fills empty boxes, and replaces only what it filled before: a figure typed stays typed.
   */
  const [prefill, setPrefill] = useState(null);
  const [item, setItem] = useState(params.get('item') || '');
  const filled = useRef({});
  useEffect(() => {
    if (!sheet.task && !sheet.enquiry && !sheet.order) { setPrefill(null); return undefined; }
    let live = true;
    const query = Object.fromEntries(Object.entries({ task: sheet.task, enquiry: sheet.enquiry, order: sheet.order, orderLine: sheet.orderLine, item }).filter(([, value]) => value));
    qcRecordsApi.prefill(query).then((answer) => {
      if (!live || !answer) return;
      setPrefill(answer);
      const before = filled.current;
      setSheet((current) => {
        const out = fillFrom(current, answer, before);
        filled.current = out.filled;
        return out.sheet;
      });
    }).catch(() => live && setPrefill(null));
    return () => { live = false; };
  }, [sheet.task, sheet.enquiry, sheet.order, sheet.orderLine, item]);
  const pickEnquiry = (value) => {
    setItem('');
    setSheet((current) => ({ ...current, enquiry: value, ...(value === current.enquiry ? {} : { order: '', orderLine: '' }) }));
  };
  const pickLine = (lineId) => setSheet((current) => ({ ...current, orderLine: lineId }));
  const pickedLine = prefill?.lines?.find((row) => row._id === prefill.line);

  const samples = useMemo(() => parseSamples(sheet.breaking.samples), [sheet.breaking.samples]);
  const worked = useMemo(() => workOut({ ...sheet, breaking: { ...sheet.breaking, samplesKg: samples } }), [sheet, samples]);
  const failed = [
    worked.breaking.result === 'fail' && 'Breaking strength',
    worked.hook === 'fail' && 'Hook pull',
    worked.clip === 'fail' && 'Clip grip',
    worked.weight === 'fail' && 'Weight',
    worked.hang === 'fail' && 'Hang load',
    sheet.print.adhesion === 'fail' && 'Print adhesion',
    sheet.print.registration === 'fail' && 'Print registration',
    sheet.drop.result === 'fail' && 'Drop',
    sheet.colourMatch.result === 'fail' && 'Colour match',
    ...sheet.measurements.map((row, index) => worked.measurements[index] === 'fail' && (row.name || 'A measurement')),
  ].filter(Boolean);
  const rejected = Number(sheet.rejected) || 0;
  const cleanPass = !failed.length && !rejected;
  const sampleSize = sheet.sampleSize === '' ? null : Number(sheet.sampleSize);
  const defectCount = sheet.defects.reduce((sum, row) => sum + (Number(row.count) || 0), 0);

  const blocked = !sheet.verdict
    ? 'Pick the verdict'
    : sheet.verdict === 'passed' && !cleanPass
      ? `${failed.length ? `${failed.join(', ')} failed` : 'Pieces were rejected'} — it cannot be a clean pass. Pick Passed with deviation (and say why) or Rejected.`
      : sheet.verdict === 'passed_with_deviation' && sheet.remarks.trim().length < 5
        ? 'Say in the remarks why it passes with a deviation'
        : rejected > 0 && !sheet.defects.length
          ? 'Say what was wrong with the rejected pieces'
          : sampleSize != null && rejected > sampleSize
            ? 'More rejected than were sampled'
            : null;

  const save = async (event) => {
    event.preventDefault();
    if (blocked) { setProblem({ message: blocked }); return; }
    setBusy(true);
    setProblem(null);
    const { samples: _typed, ...breaking } = sheet.breaking;
    const payload = clean({
      ...sheet,
      producedOn: sheet.producedOn || undefined,
      breaking: { ...breaking, samplesKg: samples.length ? samples : undefined },
      measurements: sheet.measurements.filter((row) => row.name.trim()),
      defects: sheet.defects.filter((row) => row.type && Number(row.count) > 0),
    });
    try {
      const made = await qcRecordsApi.create(payload);
      navigate(`/qc-records/${made._id}`, { replace: true });
    } catch (failure) {
      setProblem(failure);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mx-auto max-w-5xl space-y-5" noValidate>
      <PageHeader
        title="New QC record"
        subtitle="The test sheet for one lot. Fill what was checked — anything left empty is printed as not tested."
        actions={<Link to="/qc-records" className="btn-secondary">Back to QC records</Link>}
      />

      <Section title="1 · What was checked">
        <fieldset>
          <legend className="label">Stage</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {QC_STAGES.map((stage) => (
              <button key={stage.value} type="button" aria-pressed={sheet.stage === stage.value} onClick={() => set('stage')(stage.value)}
                className={`rounded-xl px-3 py-2.5 text-left ring-1 ring-inset ${sheet.stage === stage.value ? 'bg-flame-500/10 ring-flame-500/40' : 'ring-line/10 hover:bg-line/[0.04]'}`}>
                <span className="block text-sm font-semibold text-steel-100">{stage.label}</span>
                <span className="block text-xs text-steel-400">{stage.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {prefill && (prefill.customer || prefill.order) && (
          <p className="mt-4 rounded-lg bg-flame-500/10 px-3 py-2 text-sm text-steel-200" role="status">
            {prefill.customer && <b className="text-steel-50">{prefill.customer}</b>}
            {prefill.order && <> · {prefill.order.number}{prefill.order.buyerPo ? ` · PO ${prefill.order.buyerPo}` : ''}</>}
            {pickedLine
              ? <> — filled from {pickedLine.label}. Check and change anything that differs.</>
              : prefill.lines.length > 1 ? <> — pick the {prefill.lineKind === 'order' ? 'line' : 'model'} below to fill the rest.</> : null}
          </p>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Enquiry" hint={prefill?.enquiry ? `${prefill.enquiry.number} · the buyer is taken from it` : 'The buyer is taken from it'}>
            <EnquirySelect value={sheet.enquiry} onChange={pickEnquiry} won emptyLabel="No enquiry (stock or incoming)" />
          </Field>
          <Field label="Sales order" hint={orders.length ? 'Left empty, the enquiry’s latest SO is used' : sheet.enquiry ? 'No SO on this enquiry yet' : 'Pick the enquiry first'}>
            <select className="input" value={sheet.order} onChange={(event) => setSheet((current) => ({ ...current, order: event.target.value, orderLine: '' }))} disabled={!orders.length}>
              <option value="">{orders.length ? 'The enquiry’s SO' : '—'}</option>
              {orders.map((row) => <option key={row._id} value={row._id}>{row.number}{row.customerPo?.number ? ` · PO ${row.customerPo.number}` : ''}</option>)}
            </select>
          </Field>
          {prefill?.lineKind === 'order' && prefill.lines.length > 1 && (
            <Field label="Line of the order" hint="Picking the line fills the model, resin, hook, clips and print">
              <select className="input" value={sheet.orderLine} onChange={(event) => pickLine(event.target.value)}>
                <option value="">Whole order</option>
                {prefill.lines.map((line) => <option key={line._id} value={line._id}>{line.label}</option>)}
              </select>
            </Field>
          )}
          {prefill?.lineKind === 'enquiry' && prefill.lines.length > 1 && (
            <Field label="Model of the enquiry" hint="Picking it fills the model, resin, hook, clips and print">
              <select className="input" value={item} onChange={(event) => setItem(event.target.value)}>
                <option value="">Pick the model…</option>
                {prefill.lines.map((line) => <option key={line._id} value={line._id}>{line.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Model / mould">
            <MouldSelect value={sheet.mould} onChange={set('mould')} allowCreate={false} includeBlank="No mould" />
          </Field>
          <Field label="Model number"><input className="input" value={sheet.modelNumber} onChange={text('modelNumber')} maxLength={80} placeholder="NH-400" /></Field>
          <Field label="Size"><input className="input" value={sheet.size} onChange={text('size')} maxLength={40} placeholder="400 mm / 16 inch" /></Field>
          <Field label="Moulding type">
            <select className="input" value={sheet.mouldingType} onChange={text('mouldingType')}>
              <option value="">Not said</option>
              {MOULDING_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </Field>
          <Field label="Cavities checked" hint="Which cavities the samples came from"><input className="input" value={sheet.cavities} onChange={text('cavities')} maxLength={60} placeholder="1–4, or all" /></Field>
          <Field label="Machine"><MachineSelect value={sheet.machine} onChange={set('machine')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shift">
              <select className="input" value={sheet.shift} onChange={text('shift')}>
                <option value="">—</option>
                {SHIFTS.map((shift) => <option key={shift} value={shift}>{shift === 'General' ? 'General' : `Shift ${shift}`}</option>)}
              </select>
            </Field>
            <Field label="Produced on"><input type="date" className="input" value={sheet.producedOn} onChange={text('producedOn')} /></Field>
          </div>
          <Field label="Machine operator"><input className="input" value={sheet.operator} onChange={text('operator')} maxLength={80} /></Field>
        </div>
      </Section>

      <Section title="2 · Resin">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From the material register" className="sm:col-span-2"><MaterialSelect value={sheet.resin.material} onChange={set('resin.material')} /></Field>
          <Field label="Or name it"><input className="input" value={sheet.resin.name} onChange={text('resin.name')} maxLength={80} placeholder="PP / HIPS / ABS" /></Field>
          <Field label="Grade"><input className="input" value={sheet.resin.grade} onChange={text('resin.grade')} maxLength={60} placeholder="H110MA" /></Field>
          <Field label="Batch / lot number"><input className="input" value={sheet.resin.batch} onChange={text('resin.batch')} maxLength={60} /></Field>
          <Field label="Supplier"><input className="input" value={sheet.resin.supplier} onChange={text('resin.supplier')} maxLength={80} /></Field>
          <Field label="Colour"><input className="input" value={sheet.resin.colour} onChange={text('resin.colour')} maxLength={60} placeholder="Black" /></Field>
          <Field label="Masterbatch"><input className="input" value={sheet.resin.masterbatch} onChange={text('resin.masterbatch')} maxLength={60} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Masterbatch %"><NumberInput value={sheet.resin.masterbatchPercent} onChange={set('resin.masterbatchPercent')} max={100} /></Field>
            <Field label="Regrind %"><NumberInput value={sheet.resin.regrindPercent} onChange={set('resin.regrindPercent')} max={100} /></Field>
          </div>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="3 · Hook" actions={<Result value={worked.hook} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Hook type"><input className="input" value={sheet.hook.type} onChange={text('hook.type')} maxLength={60} placeholder="Swivel metal / plastic" /></Field>
            <Field label="Finish"><input className="input" value={sheet.hook.finish} onChange={text('hook.finish')} maxLength={60} placeholder="Chrome / gold / black" /></Field>
            <Field label="Pull-out needed, kgf"><NumberInput value={sheet.hook.pullRequiredKg} onChange={set('hook.pullRequiredKg')} /></Field>
            <Field label="Pull-out found, kgf"><NumberInput value={sheet.hook.pullActualKg} onChange={set('hook.pullActualKg')} /></Field>
          </div>
        </Section>
        <Section title="4 · Clips" actions={<Result value={worked.clip} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Clip type" className="sm:col-span-2"><input className="input" value={sheet.clip.type} onChange={text('clip.type')} maxLength={60} placeholder="Pinch clips / metal clips / none" /></Field>
            <Field label="Grip needed, kgf"><NumberInput value={sheet.clip.gripRequiredKg} onChange={set('clip.gripRequiredKg')} /></Field>
            <Field label="Grip found, kgf"><NumberInput value={sheet.clip.gripActualKg} onChange={set('clip.gripActualKg')} /></Field>
          </div>
        </Section>
      </div>

      <Section title="5 · Print">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Print type">
            <select className="input" value={sheet.print.type} onChange={text('print.type')}>
              <option value="">Not said</option>
              {PRINT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </Field>
          <Field label="Print colour"><input className="input" value={sheet.print.colour} onChange={text('print.colour')} maxLength={60} /></Field>
          <Field label="Artwork / logo"><input className="input" value={sheet.print.artwork} onChange={text('print.artwork')} maxLength={120} /></Field>
        </div>
        {sheet.print.type && sheet.print.type !== 'none' && (
          <div className="mt-4 flex flex-wrap gap-6">
            <div><p className="label">Adhesion (tape test)</p><PassFail label="Print adhesion" value={sheet.print.adhesion} onChange={set('print.adhesion')} /></div>
            <div><p className="label">Position / registration</p><PassFail label="Print registration" value={sheet.print.registration} onChange={set('print.registration')} /></div>
          </div>
        )}
      </Section>

      <Section title="6 · Weight and measurements">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Weight target, g"><NumberInput value={sheet.weight.target} onChange={set('weight.target')} /></Field>
          <Field label="± tolerance, g"><NumberInput value={sheet.weight.tolerance} onChange={set('weight.tolerance')} /></Field>
          <Field label="Weight found, g"><NumberInput value={sheet.weight.actual} onChange={set('weight.actual')} /></Field>
          <div className="flex items-end pb-2"><Result value={worked.weight} /></div>
        </div>
        <div className="mt-5 space-y-3">
          {sheet.measurements.map((row, index) => (
            <div key={index} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1.4fr_0.6fr_1fr_1fr_1fr_auto_auto]">
              <Field label="Measurement"><input className="input" value={row.name} onChange={(event) => setRow('measurements', index, 'name', event.target.value)} maxLength={60} list="measure-presets" /></Field>
              <Field label="Unit"><input className="input" value={row.unit} onChange={(event) => setRow('measurements', index, 'unit', event.target.value)} maxLength={10} /></Field>
              <Field label="Target"><NumberInput value={row.target} onChange={(value) => setRow('measurements', index, 'target', value)} /></Field>
              <Field label="± tolerance"><NumberInput value={row.tolerance} onChange={(value) => setRow('measurements', index, 'tolerance', value)} /></Field>
              <Field label="Found"><NumberInput value={row.actual} onChange={(value) => setRow('measurements', index, 'actual', value)} /></Field>
              <div className="pb-2"><Result value={worked.measurements[index]} /></div>
              <button type="button" className="btn-ghost pb-2 text-xs" onClick={() => dropRow('measurements', index)} aria-label={`Remove ${row.name || 'this measurement'}`}>Remove</button>
            </div>
          ))}
          <datalist id="measure-presets">{MEASURE_PRESETS.map((name) => <option key={name} value={name} />)}</datalist>
          {sheet.measurements.length < 20 && (
            <button type="button" className="btn-secondary text-sm" onClick={() => setSheet((current) => ({ ...current, measurements: [...current.measurements, { name: '', unit: 'mm', target: '', tolerance: '', actual: '' }] }))}>
              Add a measurement
            </button>
          )}
        </div>
      </Section>

      <Section title="7 · Strength tests">
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-steel-100">Tensile / breaking strength</p>
              <Result value={worked.breaking.result} />
            </div>
            <div className="grid gap-4 sm:grid-cols-[0.6fr_1.4fr]">
              <Field label="Minimum needed, kgf"><NumberInput value={sheet.breaking.requiredKg} onChange={set('breaking.requiredKg')} /></Field>
              <Field label="Each sample's breaking load, kgf" hint="Type them with commas between — 18, 17.5, 19, 16">
                <input className="input" inputMode="decimal" value={sheet.breaking.samples} onChange={text('breaking.samples')} placeholder="18, 17.5, 19, 16" />
              </Field>
            </div>
            {samples.length > 0 && (
              <p className="mt-2 text-sm tabular-nums text-steel-300">
                {samples.length} {samples.length === 1 ? 'sample' : 'samples'} · lowest <b className="text-steel-100">{worked.breaking.minKg}</b> · average <b className="text-steel-100">{worked.breaking.avgKg}</b> · highest <b className="text-steel-100">{worked.breaking.maxKg}</b> kgf
                {worked.breaking.result === 'fail' && <span className="text-danger-400"> — the lowest is under the minimum</span>}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-steel-100">Hang load</p>
              <Result value={worked.hang} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Load hung, kg"><NumberInput value={sheet.hangLoad.loadKg} onChange={set('hangLoad.loadKg')} /></Field>
              <Field label="For hours"><NumberInput value={sheet.hangLoad.hours} onChange={set('hangLoad.hours')} /></Field>
              <Field label="Bend allowed, mm"><NumberInput value={sheet.hangLoad.allowedDeflectionMm} onChange={set('hangLoad.allowedDeflectionMm')} /></Field>
              <Field label="Bend found, mm"><NumberInput value={sheet.hangLoad.deflectionMm} onChange={set('hangLoad.deflectionMm')} /></Field>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-steel-100">Drop test</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Height, cm"><NumberInput value={sheet.drop.heightCm} onChange={set('drop.heightCm')} /></Field>
                <Field label="Drops"><NumberInput value={sheet.drop.drops} onChange={set('drop.drops')} step={1} /></Field>
              </div>
              <div className="mt-2"><PassFail label="Drop test" value={sheet.drop.result} onChange={set('drop.result')} /></div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-steel-100">Colour match</p>
              <Field label="Against"><input className="input" value={sheet.colourMatch.against} onChange={text('colourMatch.against')} maxLength={120} placeholder="Approved sample / shade card" /></Field>
              <div className="mt-2"><PassFail label="Colour match" value={sheet.colourMatch.result} onChange={set('colourMatch.result')} /></div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="8 · Sample and defects">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Lot size"><NumberInput value={sheet.lotSize} onChange={set('lotSize')} step={1} /></Field>
          <Field label="Pieces checked"><NumberInput value={sheet.sampleSize} onChange={set('sampleSize')} step={1} /></Field>
          <Field label="Rejected"><NumberInput value={sheet.rejected} onChange={set('rejected')} step={1} /></Field>
        </div>
        {sampleSize != null && <p className="mt-2 text-sm text-steel-400">{Math.max(0, sampleSize - rejected)} accepted</p>}
        {(rejected > 0 || sheet.defects.length > 0) && (
          <div className="mt-4 space-y-2">
            <p className="label">What was wrong{defectCount > 0 && rejected > 0 && defectCount !== rejected ? <span className="ml-2 font-normal text-steel-400">({defectCount} counted against {rejected} rejected)</span> : null}</p>
            {sheet.defects.map((row, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <select className="input w-auto flex-1" value={row.type} onChange={(event) => setRow('defects', index, 'type', event.target.value)} aria-label="Defect">
                  <option value="">Pick the defect…</option>
                  {(defectTypes || []).map((defect) => <option key={defect.key} value={defect.key}>{defect.label}</option>)}
                </select>
                <input type="number" min={1} step={1} className="input w-24" value={row.count} onChange={(event) => setRow('defects', index, 'count', event.target.value === '' ? '' : Number(event.target.value))} aria-label="How many" />
                <button type="button" className="btn-ghost text-xs" onClick={() => dropRow('defects', index)}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn-secondary text-sm" onClick={() => setSheet((current) => ({ ...current, defects: [...current.defects, { type: '', count: 1 }] }))}>Add a defect</button>
          </div>
        )}
      </Section>

      <Section title="9 · Verdict">
        {failed.length > 0 && <p className="mb-3 text-sm text-danger-400">Failed: {failed.join(', ')}</p>}
        <div role="radiogroup" aria-label="Verdict" className="grid gap-2 sm:grid-cols-4">
          {QC_VERDICTS.map((verdict) => {
            const off = verdict.value === 'passed' && !cleanPass;
            return (
              <button key={verdict.value} type="button" role="radio" aria-checked={sheet.verdict === verdict.value} disabled={off}
                title={off ? 'A failed test or rejected pieces cannot be a clean pass' : undefined}
                onClick={() => set('verdict')(verdict.value)}
                className={`rounded-xl px-3 py-3 text-sm font-semibold ring-1 ring-inset disabled:cursor-not-allowed disabled:opacity-40 ${sheet.verdict === verdict.value ? 'bg-flame-500/10 text-steel-50 ring-flame-500/40' : 'text-steel-200 ring-line/10 hover:bg-line/[0.04]'}`}>
                {verdict.label}
              </button>
            );
          })}
        </div>
        <Field label={sheet.verdict === 'passed_with_deviation' ? 'Remarks — why it passes anyway' : 'Remarks'} className="mt-4" hint={sheet.verdict === 'passed_with_deviation' ? 'Who agreed, and to what. Needed for a pass with deviation.' : undefined}>
          <textarea className="input min-h-[5rem]" value={sheet.remarks} onChange={text('remarks')} maxLength={2000} />
        </Field>
      </Section>

      {problem && <FormError error={problem} />}
      <div className="flex flex-wrap items-center justify-end gap-3 pb-6">
        {blocked && <p className="text-sm text-steel-400">{blocked}</p>}
        <Link to="/qc-records" className="btn-secondary">Cancel</Link>
        <button type="submit" className="btn-primary" disabled={busy || Boolean(blocked)}>{busy ? 'Saving…' : 'Save the QC record'}</button>
      </div>
    </form>
  );
}
