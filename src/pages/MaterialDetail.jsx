import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { materials as materialsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import {
  Badge, ErrorState, Facts, Modal, Notice, PageHeader, Section, Spinner,
} from '../components/ui.jsx';
import MaterialForm from '../components/MaterialForm.jsx';
import { formatDate, humanise } from '../utils/format.js';
import { MATERIAL_TYPES, optionLabel } from '../utils/pipeline.js';

/**
 * One resin on the register, in full.
 *
 * Two numbers do the work here and they are not the same kind of number, which is the whole
 * reason this page is worth having.
 *
 * The **rate** is a purchase fact that moves every few weeks. A costing *copies* it rather than
 * reading through, so correcting it here never re-prices a quotation somebody has already sent —
 * which is right, and is also the thing nobody believes until they are shown it. So the page
 * shows what has been costed on this resin and how much of it is on a rate that has since
 * moved: the question "what do I need to re-cost" has an answer rather than a feeling.
 *
 * The **grammage factor** is physical and almost never moves. A cavity is a fixed volume, so a
 * denser resin makes a heavier part out of the same tool; the plant works to HIPS being PP plus
 * 18%, and a mould's grammage is recorded on a PP basis, which is why PP and LD sit at zero.
 */

const STALE_DAYS = 90;

export default function MaterialDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const mayEdit = canWrite('materials');

  const fetch = useCallback((materialId) => materialsApi.get(materialId), []);
  const { data, loading, error, reload } = useRecord(fetch, id);
  const [editing, setEditing] = useState(false);
  const [costed, setCosted] = useState(null);

  /* What has been priced on this resin. Its own request, because it is a different question
     from "what is this resin" and a slow one should not hold up the fast one. */
  useEffect(() => {
    let cancelled = false;
    materialsApi
      .pricings(id)
      .then((response) => !cancelled && setCosted(response))
      .catch(() => !cancelled && setCosted({ rows: [], stale: 0 }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <Spinner label="Loading the material" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const material = data;
  const stale =
    material.rateUpdatedAt &&
    (Date.now() - new Date(material.rateUpdatedAt).getTime()) / 86400000 > STALE_DAYS;

  const rows = costed?.rows || [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={material.name}
        subtitle={
          <>
            {material.code ? `${material.code} · ` : ''}
            {optionLabel(MATERIAL_TYPES, material.type) || humanise(material.type)}
            {material.colour ? ` · ${material.colour}` : ''}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {mayEdit && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit the material
              </button>
            )}
            <Badge status={material.isActive === false ? 'rejected' : 'approved'}>
              {material.isActive === false ? 'Off the register' : 'In use'}
            </Badge>
          </div>
        }
      />

      {stale && (
        <Notice tone="warn">
          Nobody has confirmed this rate since {formatDate(material.rateUpdatedAt)}. That is not
          wrong, but a resin rate this old is worth a second look before it is costed again.
        </Notice>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Section title="What it costs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card px-4 py-3">
                <p className="eyebrow">Rate</p>
                <p className="stat-value mt-1 text-steel-50">
                  ₹{Number(material.ratePerKg).toFixed(2)}
                  <span className="ml-1 text-sm font-semibold text-steel-400">/ kg</span>
                </p>
                <p className="mt-0.5 text-xs text-steel-500">
                  {material.rateUpdatedAt
                    ? `Confirmed ${formatDate(material.rateUpdatedAt)}`
                    : 'Never confirmed'}
                </p>
              </div>
              <div className="card px-4 py-3">
                <p className="eyebrow">Per gram</p>
                <p className="stat-value mt-1 text-steel-50">
                  ₹{Number(material.ratePerGram ?? material.ratePerKg / 1000).toFixed(4)}
                </p>
                {/* Because a costing works per piece in grams, and doing the division by hand on
                    a phone is how a decimal point lands in the wrong place. */}
                <p className="mt-0.5 text-xs text-steel-500">What a costing actually multiplies</p>
              </div>
            </div>

            <div className="mt-3 card px-4 py-3">
              <p className="eyebrow">Grammage factor</p>
              <p className="stat-value mt-1 text-steel-50">
                {material.grammageFactorPercent > 0 ? '+' : ''}
                {Number(material.grammageFactorPercent || 0).toFixed(1)}%
              </p>
              <p className="mt-0.5 text-xs text-steel-500">
                {material.grammageFactorPercent
                  ? `A part off a given tool weighs ${Math.abs(material.grammageFactorPercent).toFixed(1)}% ${material.grammageFactorPercent > 0 ? 'more' : 'less'} in this resin than in PP`
                  : 'Same weight as PP out of the same tool — the basis moulds are recorded on'}
              </p>
            </div>
          </Section>

          {/*
            The answer to "if I change this rate, what have I not re-costed?". The rule that a
            costing copies the rate is correct and is also the one people most doubt, so the
            consequence is shown rather than asserted.
          */}
          <Section title={`Costed on this resin (${rows.length})`}>
            {costed === null ? (
              <p className="text-sm text-steel-400">Looking…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-steel-400">
                Nothing has been costed on this resin yet.
              </p>
            ) : (
              <>
                {costed.stale > 0 && (
                  <p className="mb-3 rounded-lg border border-warn-500/40 bg-warn-500/[0.06] px-3 py-2 text-sm font-semibold text-warn-300">
                    {costed.stale} of these were built on a rate that has since moved. A costing
                    copies the rate rather than reading through it, so changing the figure above
                    left them where they were.
                  </p>
                )}
                <ul className="space-y-2">
                  {rows.map((row) => {
                    const onOldRate = row.cost?.rawMaterialRate !== material.ratePerKg;
                    return (
                      <li
                        key={row._id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/[0.06] px-3.5 py-3"
                      >
                        <div className="min-w-0">
                          <Link
                            to={`/pricings/${row._id}`}
                            className="text-sm font-semibold text-steel-100 hover:text-accent"
                          >
                            {row.number}
                          </Link>
                          <p className="text-xs text-steel-400">
                            {row.customer?.name || 'No customer'}
                            {row.modelNumber ? ` · ${row.modelNumber}` : ''}
                            {row.cost?.rawMaterialRate
                              ? ` · costed at ₹${Number(row.cost.rawMaterialRate).toFixed(2)}/kg`
                              : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {onOldRate && (
                            <span className="text-xs font-semibold text-warn-400">Older rate</span>
                          )}
                          <Badge status={row.status}>{humanise(row.status)}</Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Section>

          {material.notes && (
            <Section title="Notes">
              <p className="whitespace-pre-wrap text-sm text-steel-200">{material.notes}</p>
            </Section>
          )}
        </div>

        <div className="space-y-5">
          <Section title="This material">
            <Facts
              columns={1}
              items={[
                { label: 'Code', value: material.code },
                {
                  label: 'Type',
                  value: optionLabel(MATERIAL_TYPES, material.type) || humanise(material.type),
                },
                { label: 'Colour', value: material.colour },
                { label: 'Supplier', value: material.supplier },
                {
                  label: 'Rate last confirmed',
                  value: material.rateUpdatedAt ? formatDate(material.rateUpdatedAt) : null,
                },
              ]}
            />
          </Section>
        </div>
      </div>

      <Modal
        open={editing}
        title={`Edit ${material.name}`}
        description="The same form the register uses, so there is one place a field can be wrong"
        onClose={() => setEditing(false)}
      >
        <MaterialForm
          material={material}
          onClose={() => setEditing(false)}
          onSaved={reload}
        />
      </Modal>
    </div>
  );
}
