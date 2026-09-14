import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { moulds as mouldsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import { MouldThumb } from '../components/MouldPhoto.jsx';
import MouldForm from '../components/MouldForm.jsx';
import { formatCurrency, formatDate, formatNumber, humanise } from '../utils/format.js';
import {
  HANGER_CATEGORIES, HOOK_TYPES, MATERIALS, MOULD_OWNERSHIP, MOULD_STATUSES, optionLabel,
} from '../utils/pipeline.js';

/**
 * One tool on the register, in full [BLUEPRINT §28].
 *
 * The list answers "what tools exist"; this answers the question the list cannot, which is
 * always some version of **can we make this, how fast, and out of what**. The register is the
 * model master as well as the tool room's book, so two different people arrive here for two
 * different reasons — marketing wanting the size, the hook and the minimum before they offer a
 * buyer anything, and the plant wanting cavities, cycle and consumption before they plan a run.
 * Both are on the page, in that order, because the first is the shorter read.
 *
 * **The derived figures are given their own panel and their inputs are named beside them.** A
 * piece weighs one thing and consumes another — 26 g of part off a four-cavity tool with a 12 g
 * runner consumes 29 — and the single commonest error against this register is somebody reading
 * the part weight as the consumption and costing a job 10% light. Showing the arithmetic is what
 * stops that being a matter of memory.
 *
 * §8 governs the money. The per-piece conversion costs and the machine rate are stripped by the
 * server for anyone without the register's write grant, and the page says so rather than
 * rendering a row of dashes — an unexplained gap reads as a fault in the record.
 */

const grams = (value) =>
  value === undefined || value === null ? '—' : `${Number(value).toFixed(2)} g`;

const percent = (value) =>
  value === undefined || value === null ? '—' : `${Number(value).toFixed(1)}%`;

const rupees = (value) =>
  value === undefined || value === null ? '—' : `₹${Number(value).toFixed(3)}`;

/**
 * A derived figure, with the sum that produced it.
 *
 * The note is not decoration. It is the difference between a number somebody trusts and a
 * number somebody re-derives on a calculator because they cannot tell where it came from.
 */
function Derived({ label, value, note, lit }) {
  return (
    <div className={`card px-4 py-3 ${lit ? 'ring-1 ring-flame-500/40' : ''}`}>
      <p className="eyebrow">{label}</p>
      <p className={`stat-value mt-1 ${lit ? 'text-flame-400' : 'text-steel-50'}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-steel-500">{note}</p>}
    </div>
  );
}

export default function MouldDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const mayEdit = canWrite('moulds');

  const fetch = useCallback((mouldId) => mouldsApi.get(mouldId), []);
  const { data, loading, error, reload } = useRecord(fetch, id);
  const [editing, setEditing] = useState(false);

  if (loading) return <Spinner label="Loading the mould" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const mould = data;
  const running = mould.runningCavities ?? mould.activeCavities ?? mould.cavities;
  const short = running < mould.cavities;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={mould.mouldCode}
        subtitle={mould.name}
        actions={
          <div className="flex items-center gap-2">
            {mayEdit && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit the mould
              </button>
            )}
            <Badge status={mould.status}>
              {optionLabel(MOULD_STATUSES, mould.status) || humanise(mould.status)}
            </Badge>
          </div>
        }
      />

      {/* A tool that is not running is the first thing to know, not a field halfway down. */}
      {mould.isActive === false && (
        <Notice tone="warn">
          This mould is off the register — it will not be offered when a model is chosen.
        </Notice>
      )}

      {short && (
        <Notice tone="warn">
          {mould.cavities - running} of {mould.cavities} cavities are blocked, so the output below
          is what it makes today rather than what the tool is capable of.
        </Notice>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          {/*
            The catalogue half, first. It is what marketing came for, it is the shorter read,
            and it is the half a buyer's question is usually about.
          */}
          <Section title="What it makes">
            <div className="flex flex-wrap items-start gap-5">
              <MouldThumb mould={mould} size="lg" eager />
              <div className="min-w-0 flex-1">
                <Facts
                  items={[
                    { label: 'Category', value: optionLabel(HANGER_CATEGORIES, mould.category) },
                    { label: 'Size', value: mould.sizeMm ? `${mould.sizeMm} mm` : null },
                    { label: 'Hook', value: optionLabel(HOOK_TYPES, mould.hookType) },
                    { label: 'Resin', value: optionLabel(MATERIALS, mould.material) },
                    {
                      label: 'Standard minimum',
                      value: mould.moq ? `${formatNumber(mould.moq)} pcs` : null,
                    },
                    {
                      label: 'Packing',
                      value: mould.packingQty ? `${formatNumber(mould.packingQty)} per carton` : null,
                    },
                  ]}
                />
              </div>
            </div>
          </Section>

          {/*
            The arithmetic, with its inputs. See the note at the top of this file: this panel
            exists because the part weight and the consumption are different numbers and the
            difference is invisible unless something shows it.
          */}
          <Section title="What one piece takes">
            <div className="grid gap-3 sm:grid-cols-3">
              <Derived
                label="Part weight"
                value={grams(mould.partWeightGrams)}
                note="The piece itself"
              />
              <Derived
                label="Runner share"
                value={grams(mould.runnerPerPieceGrams)}
                note={
                  mould.runnerWeightGrams
                    ? `${grams(mould.runnerWeightGrams)} over ${running} up`
                    : 'No runner recorded'
                }
              />
              <Derived
                label="Consumption"
                value={grams(mould.consumptionPerPieceGrams)}
                note={
                  mould.regrindRecoveryPercent
                    ? `After ${percent(mould.regrindRecoveryPercent)} regrind recovery`
                    : 'Part plus runner share'
                }
                /* Lit, because this is the figure a costing actually multiplies by the rate. */
                lit
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Derived
                label="Shot weight"
                value={grams(mould.shotWeightGrams)}
                note={`${running} × part + runner`}
              />
              <Derived
                label="Runner"
                value={percent(mould.runnerPercent)}
                note="Of the whole shot"
              />
              <Derived
                label="Cycle"
                value={mould.cycleTimeSeconds ? `${mould.cycleTimeSeconds}s` : '—'}
                note={
                  mould.efficiencyPercent && mould.efficiencyPercent !== 100
                    ? `At ${percent(mould.efficiencyPercent)} efficiency`
                    : 'Door to door'
                }
              />
            </div>
          </Section>

          <Section title="What it produces">
            <div className="grid gap-3 sm:grid-cols-3">
              <Derived
                label="Shots / hour"
                value={mould.shotsPerHour ? formatNumber(Math.round(mould.shotsPerHour)) : '—'}
              />
              <Derived
                label="Pieces / hour"
                value={mould.piecesPerHour ? formatNumber(Math.round(mould.piecesPerHour)) : '—'}
                note={short ? `On ${running} of ${mould.cavities} cavities` : `${running} up`}
                lit
              />
              <Derived
                label="Machine hours"
                value={
                  mould.machineHoursPer1000
                    ? `${Number(mould.machineHoursPer1000).toFixed(2)} h`
                    : '—'
                }
                note="Per 1,000 pieces"
              />
            </div>
          </Section>

          {/*
            §8's half. The server has already removed these for a reader without the register's
            write grant, so the panel is replaced by the reason rather than by dashes.
          */}
          <Section title="What it costs to run, per piece">
            {mould.rateHidden ? (
              <p className="text-sm text-steel-400">
                The machine rate and the per-piece conversion costs are kept to the people who
                keep the register and to management [§8]. What a piece weighs, how fast it runs
                and what it is made of are all above.
              </p>
            ) : (
              <Facts
                items={[
                  { label: 'Machine', value: rupees(mould.machineCostPerPiece) },
                  { label: 'Job work', value: rupees(mould.jobWorkCost) },
                  { label: 'Hook', value: rupees(mould.hookCost) },
                  { label: 'Clips', value: rupees(mould.clipsCost) },
                  { label: 'Printing', value: rupees(mould.printingCost) },
                  { label: 'Packing', value: rupees(mould.packingCost) },
                ]}
              />
            )}
          </Section>

          {mould.notes && (
            <Section title="Notes">
              <p className="whitespace-pre-wrap text-sm text-steel-200">{mould.notes}</p>
            </Section>
          )}
        </div>

        {/* --------------------------------- The side --------------------------------- */}
        <div className="space-y-5">
          <Section title="The tool">
            <Facts
              columns={1}
              items={[
                {
                  label: 'Cavities',
                  value: short
                    ? `${mould.cavities} cut · ${running} running`
                    : `${mould.cavities}`,
                },
                {
                  label: 'Machine',
                  value: mould.machine?.code
                    ? `${mould.machine.code}${mould.machine.tonnage ? ` · ${mould.machine.tonnage}T` : ''}`
                    : null,
                },
                {
                  /* Redacted with the costs above, and absent rather than blank when it is. */
                  label: 'Machine rate',
                  value: mould.machine?.hourRate
                    ? `${formatCurrency(mould.machine.hourRate)} / hour`
                    : null,
                },
                { label: 'Where it is', value: mould.location },
                { label: 'Made by', value: mould.mouldMaker },
                {
                  label: 'Commissioned',
                  value: mould.commissionedOn ? formatDate(mould.commissionedOn) : null,
                },
              ]}
            />
          </Section>

          <Section title="Whose it is">
            <Facts
              columns={1}
              items={[
                {
                  label: 'Owned by',
                  value: optionLabel(MOULD_OWNERSHIP, mould.ownedBy) || humanise(mould.ownedBy),
                },
                {
                  /*
                   * Worth its own line and worth linking. A customer-funded tool must not be
                   * offered to anybody else, and that rule is only keepable if whoever is about
                   * to quote it can see whose it is without opening another screen.
                   */
                  label: 'The customer who paid for it',
                  value: mould.ownedByCustomer ? (
                    <Link
                      to={`/customers/${mould.ownedByCustomer._id || mould.ownedByCustomer}`}
                      className="font-semibold text-steel-100 hover:text-accent"
                    >
                      {mould.ownedByCustomer.name || 'Open the customer'}
                    </Link>
                  ) : null,
                  wide: true,
                },
                {
                  label: 'Developed from',
                  value: mould.developedFromEnquiry ? (
                    <Link
                      to={`/enquiries/${mould.developedFromEnquiry._id || mould.developedFromEnquiry}`}
                      className="font-semibold text-steel-100 hover:text-accent"
                    >
                      {mould.developedFromEnquiry.number || 'the enquiry'}
                    </Link>
                  ) : null,
                },
              ]}
            />
          </Section>
        </div>
      </div>

      <Modal
        open={editing}
        title={`Edit ${mould.mouldCode}`}
        description="The same form the register uses, so there is one place a field can be wrong"
        onClose={() => setEditing(false)}
        size="lg"
      >
        <MouldForm
          mould={mould}
          onClose={() => setEditing(false)}
          /* Reloaded rather than patched in: the derived figures above are the server's, and a
             page showing new inputs beside old arithmetic is worse than one that waits. */
          onSaved={reload}
        />
      </Modal>
    </div>
  );
}
