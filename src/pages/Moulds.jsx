import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { downloads, moulds as mouldsApi, products as productsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import { CustomerSelect, ProductSelect } from '../components/pickers.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { formatCurrency, formatNumber } from '../utils/format.js';
import { MATERIALS, MOULD_OWNERSHIP, MOULD_STATUSES } from '../utils/pipeline.js';

/**
 * The mould register.
 *
 * The screen is built around one fact the product master could not hold: a piece weighs one
 * thing and consumes another. Everything to the right of the divider on the form is derived
 * live from the four figures to its left — cavities, part weight, runner weight, cycle — so the
 * person entering them watches the consumption move as they type, and the gap between the part
 * and the resin is visible before the record is saved rather than discovered in a costing.
 */

const grams = (value) =>
  value === undefined || value === null ? '—' : `${Number(value).toFixed(2)} g`;

function MouldForm({ mould, onClose, onSaved }) {
  const [error, setError] = useState(null);
  const editing = Boolean(mould);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: editing
      ? {
          ...mould,
          products: (mould.products || []).map((product) => product._id ?? product),
          jobWorkCost: mould.jobWorkCost ?? '',
          hookCost: mould.hookCost ?? '',
          clipsCost: mould.clipsCost ?? '',
          printingCost: mould.printingCost ?? '',
          packingCost: mould.packingCost ?? '',
          machineCode: mould.machine?.code ?? '',
          machineTonnage: mould.machine?.tonnage ?? '',
          machineHourRate: mould.machine?.hourRate ?? '',
          ownedByCustomer: mould.ownedByCustomer?._id ?? mould.ownedByCustomer ?? '',
          commissionedOn: mould.commissionedOn ? mould.commissionedOn.slice(0, 10) : '',
        }
      : {
          material: 'pp',
          status: 'active',
          /* A single-cavity tool is the commonest, and the safest thing to assume. */
          cavities: 1,
          ownedBy: 'company',
          efficiencyPercent: 100,
          regrindRecoveryPercent: 0,
          runnerWeightGrams: 0,
          products: [],
        },
  });

  const watched = watch();
  const number = (value) => (value === '' || value === null || value === undefined ? undefined : Number(value));

  /*
   * The same arithmetic the server derives, run here only so the figures move while somebody
   * types. Nothing computed in this block is ever posted — the register recomputes all of it on
   * save, so a divergence between these lines and the model shows up as a number that changes
   * when the form closes rather than as two stored answers.
   */
  const derived = useMemo(() => {
    const cut = Number(watched.cavities) || 0;
    const running = watched.activeCavities === '' || watched.activeCavities === undefined
      ? cut
      : Math.min(Number(watched.activeCavities) || 0, cut);
    const part = Number(watched.partWeightGrams) || 0;
    const runner = Number(watched.runnerWeightGrams) || 0;
    const cycle = Number(watched.cycleTimeSeconds) || 0;
    const efficiency = Number(watched.efficiencyPercent) || 100;
    const recovered = (Number(watched.regrindRecoveryPercent) || 0) / 100;
    const rate = Number(watched.machineHourRate) || 0;
    const conversion =
      (Number(watched.jobWorkCost) || 0) +
      (Number(watched.hookCost) || 0) +
      (Number(watched.clipsCost) || 0) +
      (Number(watched.printingCost) || 0) +
      (Number(watched.packingCost) || 0);

    const shot = running ? running * part + runner : 0;
    const runnerShare = running ? runner / running : 0;
    const consumption = part + runnerShare * (1 - recovered);
    const perHour = cycle ? Math.round((3600 / cycle) * (efficiency / 100) * running) : 0;

    return {
      running,
      cut,
      shot,
      runnerShare,
      consumption,
      runnerPercent: shot ? (runner / shot) * 100 : 0,
      perHour,
      hoursPer1000: perHour ? 1000 / perHour : 0,
      costPerPiece: rate && perHour ? rate / perHour : 0,
      conversion,
      /* The number the whole register exists to make visible. */
      overPart: part ? ((consumption - part) / part) * 100 : 0,
    };
  }, [watched]);

  const submit = async (values) => {
    setError(null);

    const payload = {
      name: values.name,
      products: values.products?.length ? values.products : undefined,
      material: values.material,
      cavities: number(values.cavities),
      activeCavities: number(values.activeCavities),
      partWeightGrams: number(values.partWeightGrams),
      runnerWeightGrams: number(values.runnerWeightGrams),
      regrindRecoveryPercent: number(values.regrindRecoveryPercent),
      cycleTimeSeconds: number(values.cycleTimeSeconds),
      efficiencyPercent: number(values.efficiencyPercent),
      jobWorkCost: number(values.jobWorkCost),
      hookCost: number(values.hookCost),
      clipsCost: number(values.clipsCost),
      printingCost: number(values.printingCost),
      packingCost: number(values.packingCost),
      machine: {
        code: values.machineCode || undefined,
        tonnage: number(values.machineTonnage),
        hourRate: number(values.machineHourRate),
      },
      status: values.status,
      ownedBy: values.ownedBy,
      /*
       * Null rather than left out when the tool becomes ours: the register refuses a company
       * mould that still names a customer, and an omitted field would leave the old one in
       * place and the save would come back refused with nothing on screen to explain it.
       */
      ownedByCustomer: values.ownedBy === 'customer' ? values.ownedByCustomer || undefined : null,
      mouldMaker: values.mouldMaker || undefined,
      commissionedOn: values.commissionedOn || undefined,
      location: values.location || undefined,
      notes: values.notes || undefined,
    };

    try {
      onSaved(
        editing
          ? await mouldsApi.update({ id: mould._id, expectedUpdatedAt: mould.updatedAt, ...payload })
          : await mouldsApi.create({ mouldCode: values.mouldCode, ...payload })
      );
      onClose();
    } catch (submitError) {
      setError(submitError);
    }
  };

  const products = watched.products || [];

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mould number" error={errors.mouldCode} hint={editing ? 'Stamped on the tool — not editable' : 'e.g. M-142'}>
          <input
            className="input uppercase"
            disabled={editing}
            defaultValue={mould?.mouldCode}
            {...(editing ? {} : register('mouldCode', { required: 'The mould number is required' }))}
          />
        </Field>
        <Field label="What it makes" error={errors.name}>
          <input className="input" placeholder="400mm shirt hanger" {...register('name', { required: 'A name is required' })} />
        </Field>
      </div>

      {/*
        A list, because one tool is one geometry and the catalogue splits by resin: the same
        steel that makes the virgin-PP hanger makes the recycled one, and they are two model
        codes. Added one at a time and removed by their chip.
      */}
      <Field label="Models off this tool" hint="Add every catalogue code this steel produces">
        <div className="space-y-2">
          {products.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {products.map((id) => (
                <ProductChip
                  key={id}
                  id={id}
                  onRemove={() => setValue('products', products.filter((other) => other !== id))}
                />
              ))}
            </div>
          )}
          <ProductSelect
            value=""
            onChange={(id) => id && !products.includes(id) && setValue('products', [...products, id])}
            includeBlank="Add a model…"
          />
        </div>
      </Field>

      {/* ---------------------------- What is measured ---------------------------- */}

      <div>
        <p className="eyebrow mb-2">Measured at the press</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cavities" error={errors.cavities} hint="As cut">
            <input type="number" min="1" className="input" {...register('cavities', { required: 'A mould has cavities' })} />
          </Field>
          <Field label="Running" hint="Blank means all of them">
            <input type="number" min="0" className="input" placeholder={watched.cavities || ''} {...register('activeCavities')} />
          </Field>
          <Field label="Resin">
            <select className="input" {...register('material')}>
              {MATERIALS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Part weight (g)" error={errors.partWeightGrams} hint="One moulded piece">
            <input type="number" step="0.01" className="input" {...register('partWeightGrams', { required: 'A piece has a weight' })} />
          </Field>
          <Field label="Runner weight (g)" hint="The whole system, per shot">
            <input type="number" step="0.01" className="input" {...register('runnerWeightGrams')} />
          </Field>
          <Field label="Regrind recovery (%)" hint="How much of the runner goes back in">
            <input type="number" step="1" min="0" max="100" className="input" {...register('regrindRecoveryPercent')} />
          </Field>
          <Field label="Cycle time (s)" error={errors.cycleTimeSeconds} hint="One shot, door to door">
            <input type="number" step="0.1" className="input" {...register('cycleTimeSeconds', { required: 'A cycle takes time' })} />
          </Field>
          <Field label="Achieved (%)" hint="Against the nameplate cycle — nothing runs at 100">
            <input type="number" step="1" min="1" max="100" className="input" {...register('efficiencyPercent')} />
          </Field>
          <Field label="Status">
            <select className="input" {...register('status')}>
              {MOULD_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* --------------------- What the part costs to finish --------------------- */}

      <div>
        <p className="eyebrow mb-2">Cost per piece, beyond the resin</p>
        <p className="mb-2 text-[0.6875rem] text-steel-500">
          Facts about this tool and the part it makes, so a costing that names this mould starts
          from them — and can still change any of them for a particular job.
        </p>
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Job work">
            <input type="number" step="0.01" min="0" className="input" {...register('jobWorkCost')} />
          </Field>
          <Field label="Hook">
            <input type="number" step="0.01" min="0" className="input" {...register('hookCost')} />
          </Field>
          <Field label="Clips">
            <input type="number" step="0.01" min="0" className="input" {...register('clipsCost')} />
          </Field>
          <Field label="Print">
            <input type="number" step="0.01" min="0" className="input" {...register('printingCost')} />
          </Field>
          <Field label="Packing">
            <input type="number" step="0.01" min="0" className="input" {...register('packingCost')} />
          </Field>
        </div>
        <p className="mt-2 text-right text-xs text-steel-400">
          Conversion{' '}
          <span className="tabular-nums text-steel-100">{formatCurrency(derived.conversion)}</span>{' '}
          per piece
        </p>
      </div>

      {/* ----------------------------- What follows ----------------------------- */}

      <div>
        <p className="eyebrow mb-2">What follows from it</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Derived label="Shot weight" value={grams(derived.shot)} note={`${derived.running || 0} pieces + runner`} />
          <Derived
            label="Consumes per piece"
            value={grams(derived.consumption)}
            note={
              derived.overPart > 0.05
                ? `${derived.overPart.toFixed(1)}% over the part weight`
                : 'Same as the part — no runner'
            }
            lit
          />
          <Derived label="Runner share of shot" value={`${derived.runnerPercent.toFixed(1)}%`} note="Over 10% is a hot-runner conversation" />
          <Derived label="Pieces an hour" value={derived.perHour ? formatNumber(derived.perHour) : '—'} note={`${derived.running || 0} up`} />
          <Derived
            label="Press hours per 1,000"
            value={derived.hoursPer1000 ? derived.hoursPer1000.toFixed(2) : '—'}
            note="How a date gets promised"
          />
          <Derived
            label="Machine cost per piece"
            value={derived.costPerPiece ? formatCurrency(derived.costPerPiece) : '—'}
            note={derived.costPerPiece ? 'At the rate below' : 'Needs an hourly rate'}
          />
        </div>

        {/*
          Said before saving rather than discovered in a costing three weeks later. This is the
          entire reason the register holds a runner weight at all.
        */}
        {derived.overPart > 0.05 && (
          <p className="mt-3 text-xs text-steel-400">
            A piece weighs {grams(Number(watched.partWeightGrams) || 0)} and consumes{' '}
            {grams(derived.consumption)} — costing on the part weight would understate the resin by{' '}
            {derived.overPart.toFixed(1)}% on every quotation off this tool.
          </p>
        )}
      </div>

      {/* -------------------------------- The rest -------------------------------- */}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Press">
          <input className="input" placeholder="INJ-02" {...register('machineCode')} />
        </Field>
        <Field label="Tonnage">
          <input type="number" className="input" {...register('machineTonnage')} />
        </Field>
        <Field label="Machine rate (₹/hour)" hint="Costing only — marketing does not see this">
          <input type="number" step="0.01" className="input" {...register('machineHourRate')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Whose tool" hint="A buyer-funded model is not ours to offer around">
          <select className="input" {...register('ownedBy')}>
            {MOULD_OWNERSHIP.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        {watched.ownedBy === 'customer' && (
          <Field label="Who paid for it">
            <CustomerSelect
              value={watched.ownedByCustomer || ''}
              onChange={(id) => setValue('ownedByCustomer', id)}
              emptyLabel="Select the customer…"
            />
          </Field>
        )}
        <Field label="Where it is">
          <input className="input" placeholder="Moulding bay 2" {...register('location')} />
        </Field>
        <Field label="Mould maker">
          <input className="input" {...register('mouldMaker')} />
        </Field>
        <Field label="Commissioned">
          <input type="date" className="input" {...register('commissionedOn')} />
        </Field>
      </div>

      <Field label="Notes">
        <textarea rows={2} className="input" placeholder="Cavity 4 blocked — core pin sheared" {...register('notes')} />
      </Field>

      {error && (
        <Notice tone="danger">
          <p>{error.message}</p>
          {error.details?.map((detail) => (
            <p key={detail.field} className="text-xs">{detail.field}: {detail.message}</p>
          ))}
        </Notice>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add to the register'}
        </button>
      </div>
    </form>
  );
}

/** A derived figure. Never an input — everything here is arithmetic over what is above it. */
function Derived({ label, value, note, lit }) {
  return (
    <div className={`card px-4 py-3 ${lit ? 'ring-1 ring-flame-500/40' : ''}`}>
      <p className="eyebrow">{label}</p>
      <p className={`stat-value mt-1 ${lit ? 'text-flame-400' : 'text-steel-50'}`}>{value}</p>
      {note && <p className="mt-0.5 text-[0.6875rem] text-steel-500">{note}</p>}
    </div>
  );
}

/**
 * A model already on the tool, with the way to take it off again.
 *
 * It resolves its own code, because the form holds ids and a chip reading `68f3a1…` tells
 * nobody which model they are about to remove. On an id that no longer resolves it falls back
 * to the tail of the id rather than rendering nothing: a chip that vanishes leaves a model
 * silently attached to the tool with no way to see it, let alone take it off.
 */
function ProductChip({ id, onRemove }) {
  const [code, setCode] = useState(null);

  useEffect(() => {
    let live = true;
    productsApi
      .get(id)
      .then((product) => live && setCode(product.modelCode))
      .catch(() => live && setCode(`#${String(id).slice(-6)}`));
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-line/[0.06] px-2 py-1 text-xs text-steel-200 ring-1 ring-inset ring-line/10">
      {code || '…'}
      <button
        type="button"
        className="text-steel-500 hover:text-danger-400"
        onClick={onRemove}
        aria-label={`Remove ${code || 'this model'}`}
      >
        ×
      </button>
    </span>
  );
}

export default function Moulds() {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [material, setMaterial] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const term = useDebounced(search);
  const filters = {
    search: term || undefined,
    status: status || undefined,
    material: material || undefined,
  };
  const { data, pagination, loading, error, reload } = useRecordList(mouldsApi.list, {
    ...filters,
    page,
    limit: 25,
  });

  const mayWrite = canWrite('moulds');

  const onFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Mould register"
        subtitle="Every tool on the floor, and what a piece off it actually consumes"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton download={downloads.moulds} params={filters} />
            {mayWrite && (
              <button type="button" className="btn-primary" onClick={() => setEditing({})}>
                + New mould
              </button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search mould number, name or press…"
          value={search}
          onChange={onFilterChange(setSearch)}
        />
        <select className="input w-40" value={status} onChange={onFilterChange(setStatus)} aria-label="Status">
          <option value="">All statuses</option>
          {MOULD_STATUSES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="input w-44" value={material} onChange={onFilterChange(setMaterial)} aria-label="Resin">
          <option value="">All resins</option>
          {MATERIALS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {loading && <TableSkeleton columns={7} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No tools match"
          description="Try a different search, or add the mould to the register."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">Mould</th>
                    <th className="px-4 py-3">Makes</th>
                    <th className="px-4 py-3 text-right">Cavities</th>
                    <th className="px-4 py-3 text-right">Part</th>
                    {/* The two columns that are the point of the register, side by side. */}
                    <th className="px-4 py-3 text-right">Consumes</th>
                    <th className="px-4 py-3 text-right">Runner</th>
                    <th className="px-4 py-3 text-right">Pcs/hour</th>
                    <th className="px-4 py-3">Status</th>
                    {mayWrite && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((mould) => {
                    const short = mould.runningCavities < mould.cavities;
                    return (
                      <tr key={mould._id} className="row-hover">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-steel-100">{mould.mouldCode}</p>
                          <p className="text-xs text-steel-400">{mould.name}</p>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-steel-300">
                          {(mould.products || []).map((product) => product.modelCode).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          <span className={short ? 'text-warn-400' : 'text-steel-200'}>
                            {mould.runningCavities}
                          </span>
                          <span className="text-steel-500">/{mould.cavities}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-300">
                          {Number(mould.partWeightGrams).toFixed(1)} g
                        </td>
                        {/*
                          Lit, because it is the number a costing should start from and the one
                          people reach past to the part weight beside it.
                        */}
                        <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-flame-400">
                          {Number(mould.consumptionPerPieceGrams).toFixed(2)} g
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-300">
                          {mould.runnerPercent}%
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums text-steel-200">
                          {formatNumber(mould.piecesPerHour)}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge status={mould.status} />
                            {mould.ownedBy === 'customer' && <Badge tone="info">Customer's</Badge>}
                            {mould.isActive === false && <Badge status="inactive" />}
                          </div>
                        </td>
                        {mayWrite && (
                          <td className="px-4 py-3.5 text-right">
                            <button type="button" className="row-action" onClick={() => setEditing(mould)}>
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      ))}

      <Modal
        open={Boolean(editing)}
        title={editing?._id ? `Mould ${editing.mouldCode}` : 'New mould'}
        description="Consumption, output and machine cost are derived — only what is measured is entered"
        onClose={() => setEditing(null)}
        size="lg"
      >
        {editing && (
          <MouldForm
            mould={editing._id ? editing : null}
            onClose={() => setEditing(null)}
            onSaved={reload}
          />
        )}
      </Modal>
    </div>
  );
}
