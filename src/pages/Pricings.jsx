import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { pricings as pricingsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDebounced, useRecordList } from '../hooks/useRecords.js';
import {
  Badge, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, Pagination, TableSkeleton,
} from '../components/ui.jsx';
import StagePipeline from '../components/StagePipeline.jsx';
import { formatCompactCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';

/**
 * Costing sheets [BLUEPRINT §7, §9].
 *
 * The screen shows two different things to two different people, and that is the module rather
 * than a nicety. Costing and management see the sheet: the cost lines, the margin, the floor.
 * Marketing sees the price they may quote and whether it is cleared to go out — and the server
 * has already removed the rest [§8], so this cannot leak it by forgetting.
 *
 * The one thing marketing does get about the floor is whether the price is under it, because a
 * block nobody can explain reads as the system being broken.
 */

const PRICING_STAGES = [
  { value: 'requested', label: 'Requested' },
  { value: 'costed', label: 'Costed' },
  { value: 'approval_pending', label: 'Needs approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Refused' },
];

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(2)}`;

/**
 * The sheet, built.
 *
 * The calculated price is shown but never typed: it is arithmetic over the lines above it, and
 * an input that can disagree with its own inputs is worse than no input.
 */
function CostForm({ pricing, onClose, onSaved }) {
  const [cost, setCost] = useState({
    gramWeight: pricing.cost?.gramWeight ?? '',
    rawMaterialRate: pricing.cost?.rawMaterialRate ?? '',
    productionCost: pricing.cost?.productionCost ?? '',
    printingCost: pricing.cost?.printingCost ?? '',
    hookCost: pricing.cost?.hookCost ?? '',
    packingCost: pricing.cost?.packingCost ?? '',
    otherCost: pricing.cost?.otherCost ?? '',
  });
  const [targetMargin, setMargin] = useState(pricing.targetMargin ?? 20);
  const [minimum, setMinimum] = useState(pricing.minimumSellingPrice ?? '');
  const [approved, setApproved] = useState(pricing.approvedSellingPrice ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const number = (value) => (value === '' || value === null ? undefined : Number(value));

  // The same arithmetic the server does, so the sheet adds up as it is typed rather than after
  // it is saved. The server's answer is still the one that is stored.
  const material = (Number(cost.gramWeight) * Number(cost.rawMaterialRate)) / 1000 || 0;
  const total =
    material +
    ['productionCost', 'printingCost', 'hookCost', 'packingCost', 'otherCost'].reduce(
      (sum, key) => sum + (Number(cost[key]) || 0),
      0
    );
  const margin = Number(targetMargin) || 0;
  const calculated = total && margin < 100 ? total / (1 - margin / 100) : total;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await pricingsApi.cost({
          id: pricing._id,
          cost: Object.fromEntries(
            Object.entries(cost).map(([key, value]) => [key, number(value)])
          ),
          targetMargin: number(targetMargin),
          minimumSellingPrice: number(minimum),
          approvedSellingPrice: number(approved),
        })
      );
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const line = (key, label, hint) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        step="0.01"
        min="0"
        className="input"
        value={cost[key]}
        onChange={(event) => setCost({ ...cost, [key]: event.target.value })}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {line('gramWeight', 'Gram weight', 'Grams in one piece')}
        {line('rawMaterialRate', 'Raw material rate', '₹ per kilo, as the market quotes it')}
      </div>

      {/* The derived line, in the middle of the sheet where it is checked rather than at the
          end where it is taken on trust. */}
      <div className="rounded-lg border border-line/[0.08] bg-line/[0.02] px-4 py-3">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-steel-500">
          Material cost per piece
        </p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-steel-50">{rupees(material)}</p>
        <p className="mt-0.5 text-[0.6875rem] text-steel-500">
          {cost.gramWeight || 0}g × ₹{cost.rawMaterialRate || 0}/kg ÷ 1000
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {line('productionCost', 'Production', 'Per piece')}
        {line('printingCost', 'Printing', 'Per piece')}
        {line('hookCost', 'Hook / clip', 'Per piece')}
        {line('packingCost', 'Packing', 'Per piece')}
        {line('otherCost', 'Anything else', 'Per piece')}
        <Field label="Target margin (%)" hint="On the selling price, not added to the cost">
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            className="input"
            value={targetMargin}
            onChange={(event) => setMargin(event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card px-4 py-3">
          <p className="eyebrow">Total cost</p>
          <p className="stat-value mt-1 text-steel-50">{rupees(total)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Calculated price</p>
          <p className="stat-value mt-1 text-steel-50">{rupees(calculated)}</p>
          <p className="mt-0.5 text-[0.6875rem] text-steel-500">Cost at {margin}% margin</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Margin on approved</p>
          <p className="stat-value mt-1 text-steel-50">
            {approved && total ? `${(((approved - total) / approved) * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Minimum selling price"
          hint="The floor. Below it, nothing is quoted until management signs it off"
        >
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
          />
        </Field>
        <Field label="Approved selling price" hint="What marketing may quote. Blank uses the calculated price">
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            placeholder={calculated ? calculated.toFixed(2) : ''}
            value={approved}
            onChange={(event) => setApproved(event.target.value)}
          />
        </Field>
      </div>

      {/* Said before saving, not discovered after: the route this sheet is about to take. */}
      {minimum !== '' && approved !== '' && Number(approved) < Number(minimum) && (
        <Notice tone="warn">
          This is below the minimum, so it will go to management for approval and nothing can be
          quoted until they sign it off.
        </Notice>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save the costing'}
        </button>
      </div>
    </form>
  );
}

/** Signing off a price under the floor, or sending it back [§9]. */
function DecisionForm({ pricing, onClose, onSaved }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const decide = async (approve) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await pricingsApi.decide({ id: pricing._id, approve, note: note || undefined }));
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card px-4 py-3">
          <p className="eyebrow">Total cost</p>
          <p className="stat-value mt-1 text-steel-50">{rupees(pricing.totalCost)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Minimum</p>
          <p className="stat-value mt-1 text-steel-50">{rupees(pricing.minimumSellingPrice)}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="eyebrow">Asking</p>
          <p className="stat-value mt-1 text-warn-400">{rupees(pricing.approvedSellingPrice)}</p>
          <p className="mt-0.5 text-[0.6875rem] text-steel-500">
            {pricing.grossMarginPercent}% margin
          </p>
        </div>
      </div>

      <Field label="Note" hint="Required when refusing — it is what the re-costing is built from">
        <textarea rows={2} className="input" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-danger" disabled={busy} onClick={() => decide(false)}>
          Send it back
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => decide(true)}>
          Approve this price
        </button>
      </div>
    </div>
  );
}

export default function Pricings() {
  const { canWrite } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [costing, setCosting] = useState(null);
  const [deciding, setDeciding] = useState(null);
  const [params] = useSearchParams();

  const mayCost = canWrite('pricing');
  const term = useDebounced(search);

  const filters = {
    search: term || undefined,
    status: status || undefined,
    enquiry: params.get('enquiry') || undefined,
  };
  const { data, pagination, meta, loading, error, reload } = useRecordList(pricingsApi.list, {
    ...filters,
    page,
    limit: 25,
  });

  const selectStage = (value) => {
    setStatus(value === status ? '' : value);
    setPage(1);
  };

  const saved = () => {
    setCosting(null);
    setDeciding(null);
    reload();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Costings"
        subtitle={
          mayCost
            ? 'What a job costs to make, and the price marketing may quote against it'
            : 'The price you may quote. The cost behind it is management’s [§8]'
        }
      />

      <StagePipeline
        stages={PRICING_STAGES}
        counts={meta.stageCounts}
        selected={status}
        onSelect={selectStage}
        loading={loading}
        dense
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search number or model…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {loading && <TableSkeleton columns={mayCost ? 7 : 5} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && (data.length === 0 ? (
        <EmptyState
          title="No costings here"
          description="An enquiry reaching Pricing required raises one by itself."
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-3">Costing</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Model</th>
                    <th className="px-3 py-3 text-right">Quantity</th>
                    {mayCost && <th className="px-3 py-3 text-right">Cost</th>}
                    <th className="px-3 py-3 text-right">Price</th>
                    {mayCost && <th className="px-3 py-3 text-right">Margin</th>}
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/[0.04]">
                  {data.map((row) => (
                    <tr key={row._id} className="row-hover">
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <p className="font-semibold text-steel-100">{row.number}</p>
                        <p className="text-xs text-steel-400">{formatDate(row.requestedAt)}</p>
                      </td>
                      <td className="px-3 py-3.5 text-steel-200">{row.customer?.name || '—'}</td>
                      <td className="px-3 py-3.5 text-steel-300">{row.modelNumber || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-200">
                        {formatNumber(row.quantity)}
                      </td>
                      {mayCost && (
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-400">
                          {rupees(row.totalCost)}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-100">
                        {rupees(row.approvedSellingPrice)}
                        {/* Marketing's one fact about the floor: whether they may quote yet.
                            Not `belowMinimum` — a sheet MD has signed off is still under the
                            floor, and this hint beside an Approved badge reads as a block. */}
                        {row.needsApproval && (
                          <p className="text-[0.6875rem] font-semibold text-warn-400">Needs approval</p>
                        )}
                      </td>
                      {mayCost && (
                        <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-steel-300">
                          {row.grossMarginPercent === null || row.grossMarginPercent === undefined
                            ? '—'
                            : `${row.grossMarginPercent}%`}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-3.5">
                        <Badge status={row.status}>{humanise(row.status)}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-right">
                        {mayCost && row.status === 'approval_pending' && (
                          <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => setDeciding(row)}>
                            Decide
                          </button>
                        )}
                        {mayCost && row.status !== 'approval_pending' && row.status !== 'rejected' && (
                          <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setCosting(row)}>
                            {row.status === 'requested' ? 'Build it' : 'Edit'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination pagination={pagination} onChange={setPage} />
        </>
      ))}

      {/* Said once, where somebody would otherwise wonder why the table is thin. */}
      {!mayCost && data.length > 0 && (
        <p className="mt-4 text-xs leading-relaxed text-steel-500">
          The cost base, the margin and the minimum price are management’s [§8]. What you see is
          the price you may quote, and whether it is cleared to go out.
        </p>
      )}

      <Modal
        open={Boolean(costing)}
        title={`Costing ${costing?.number || ''}`}
        description="Every line is per piece. The calculated price is worked out, not typed"
        size="lg"
        onClose={() => setCosting(null)}
      >
        {costing && <CostForm pricing={costing} onClose={() => setCosting(null)} onSaved={saved} />}
      </Modal>

      <Modal
        open={Boolean(deciding)}
        title={`Approve ${deciding?.number || ''}?`}
        description="This price is below the approved minimum, so nothing can be quoted until it is settled"
        onClose={() => setDeciding(null)}
      >
        {deciding && (
          <DecisionForm pricing={deciding} onClose={() => setDeciding(null)} onSaved={saved} />
        )}
      </Modal>
    </div>
  );
}
