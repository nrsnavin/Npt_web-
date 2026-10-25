import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { production as productionApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import TaskWorkflow from '../components/TaskWorkflow.jsx';
import TaskEdd from '../components/TaskEdd.jsx';
import HandoffTaskActions from '../components/HandoffTaskActions.jsx';
import { TaskFacts, TaskTimeline } from '../components/TaskHistory.jsx';
import { BAND_TONE, WorkOrderChip } from '../components/ProductionQueueList.jsx';
import { PartsList, PrintReferenceView } from '../components/OrderLineParts.jsx';
import AddToProductionQueue from '../components/AddToProductionQueue.jsx';
import ProductionInChargeLine from '../components/ProductionInChargeLine.jsx';
import { ErrorState, PageHeader, Section, TableSkeleton } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import { departmentLabel } from '../utils/pipeline.js';
import { dueWords } from '../utils/productionQueue.js';
import { dateLabelFor, givenDateOf } from '../utils/edd.js';
import { WORK_ORDER_STATUS } from '../utils/workOrders.js';
import { DeliveryReading } from '../components/DeliveryRisk.jsx';
import ModelJourney from '../components/ModelJourney.jsx';

/**
 * One enquiry's production, worked in one place [server: productionQueue.controller
 * `productionWorkflow`] — opened from its line on the production queue.
 *
 * At the top, where it stands in at most thirty words and each model on a row: what follows
 * moulding, Production's status, its EDD and completion, and its work orders. Below, Production's
 * own updates — it decides printing and assembly, gives its dates and moves each model's status —
 * and, beside them, the updates of the teams after it, to read: Printing, Assembly, Quality and
 * Dispatch work on their own desks, and give their own dates, which show here. Then the work
 * orders and the presses.
 */

const STATUS_TONE = (status) => (!status ? 'text-steel-500' : status.issue ? 'text-danger-400' : status.done ? 'text-success-400' : 'text-steel-100');

function StatusCell({ status, received, needed }) {
  if (!needed) return <span className="text-xs text-steel-500">—</span>;
  if (!status) return <span className="text-xs font-semibold text-warn-400">Not tasked yet</span>;
  return (
    <span className="block">
      <span className={`text-sm font-semibold ${STATUS_TONE(status)}`}>{status.label}</span>
      {/* The hand-over date this team gave the next one, or its EDD where it is the last. */}
      {status.given && <span className="block text-xs font-semibold text-steel-200">{status.given.label} {formatDate(status.given.date)}</span>}
      {received && <span className="block text-xs text-steel-500">goods came {formatDate(received)}</span>}
      {/* Handed on or ready: this team is done with the model, though its task stays open for the others [server: productionSummary `statusFor`]. */}
      {status.through && <span className="block text-xs text-success-400">closed for this model</span>}
    </span>
  );
}

/**
 * A team after Production on the enquiry, to read: where it stands, who has it, the date it gave
 * — a hand-over to the next team, or its own completion date — and its updates. Its work is done
 * on its own desk; Production does not move it, nor give or confirm its date.
 */
function TeamUpdates({ title, task }) {
  const catalogue = useHandoffCatalogue();
  if (!task) return null;
  const button = buttonFor(catalogue, task.kind);
  const label = (button?.form?.statuses || []).find((entry) => entry.key === task.status)?.label || (task.completed ? 'Done' : 'Asked');
  const given = givenDateOf(task);
  return (
    <div className="rounded-xl border border-line/[0.08] bg-line/[0.02] p-3" aria-label={`${title} updates`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-steel-100">{title}</p>
        <p className="text-xs text-steel-400">{task.completed ? 'Done' : label}{task.user?.name ? ` · ${task.user.name}` : ' · not picked up'}</p>
      </div>
      {given && <p className="mt-1 text-xs font-semibold text-steel-200">{dateLabelFor(task, 'Completion date')} {formatDate(given)}</p>}
      <TaskTimeline task={task} button={button} compact className="mt-2" />
    </div>
  );
}

export default function ProductionWorkflow() {
  const { taskId } = useParams();
  const { isAdmin, departments = [], user, canWrite, mayPlanProduction } = useAuth();
  const catalogue = useHandoffCatalogue();
  const [adding, setAdding] = useState(false);
  const fetch = useCallback(() => productionApi.workflow(taskId), [taskId]);
  const { data, loading, error, reload } = useRecord(fetch, `production-workflow-${taskId}`);
  const me = String(user?.id || user?._id || '');
  const mayWork = (task) => Boolean(task) && (isAdmin || departments.includes(task.department) || String(task.user?._id || task.user || '') === me);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <div className="mx-auto max-w-6xl"><TableSkeleton rows={6} columns={5} /></div>;

  const { task, enquiry, models = [], teams = {}, workOrders = [], specs = [], floor = {}, summary, band, delivery } = data;
  /* What each model is made with, from its sales order line: hook, clip, print and the print reference. */
  const modelKey = (model) => String(model || '').toLowerCase().replace(/\s+/g, '');
  const specOf = (model) => specs.find((spec) => modelKey(spec.model) === modelKey(model)) || null;
  const button = buttonFor(catalogue, task.kind);
  const tone = BAND_TONE[band] || BAND_TONE.later;
  const edd = enquiry.edd?.date || null;
  const works = mayWork(task);
  const changed = () => reload();
  const orderId = task.order?._id || task.order || null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={`Production workflow — ${enquiry.team ? `Team task · ${enquiry.customer?.name || 'no customer named'}` : enquiry.number}`}
        subtitle={[enquiry.customer?.name, task.order?.number, enquiry.owner?.name && `${enquiry.owner.name}’s buyer`].filter(Boolean).join(' · ')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/production/queue" className="btn-secondary">← Queue</Link>
            {!enquiry.team && <Link to={`/enquiries/${enquiry._id}`} className="btn-secondary">Enquiry</Link>}
            {/* Routed, planned and dated by the Production in charge (or Admin) — the rest of Production reads it. */}
            {works && mayPlanProduction && !task.completed && !task.queuedAt && (
              <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Add to production queue</button>
            )}
            {canWrite('production') && !enquiry.team && (
              <Link to={`/mould-runs?start=1&enquiry=${enquiry._id}${orderId ? `&order=${orderId}` : ''}`} className="btn-secondary">Start a run</Link>
            )}
          </div>
        }
      />
      <ProductionInChargeLine />

      <AddToProductionQueue open={adding} task={task} enquiryNumber={enquiry.number || 'this team task'} onClose={() => setAdding(false)} onAdded={changed} />

      {/* Where it stands, as the queue says it. */}
      <div className={`card border-l-4 ${tone.edge} flex flex-wrap items-center gap-4 p-4`}>
        <div>
          <p className={`text-lg font-bold tabular-nums ${band === 'late' ? 'text-danger-400' : 'text-steel-50'}`}>{edd ? formatDate(edd) : 'No EDD yet'}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone.chip}`}>{edd ? dueWords(edd) : 'marketing gives it on the enquiry'}</span>
        </div>
        <p className="min-w-[14rem] flex-1 text-sm leading-snug text-steel-200">{summary}</p>
      </div>
      {/* Will it make marketing's EDD — every model and team counted [server: deliveryRisk.service]. */}
      <DeliveryReading risk={delivery} />

      {/* Each model's own journey: Production, Printing / Assembly as routed, Quality, Dispatch — and where it stands on each. */}
      {data.journeys?.length > 0 && (
        <Section title="Each model’s journey">
          <ModelJourney journeys={data.journeys} />
        </Section>
      )}

      {/* Each model on a row: the route after moulding, each team's status, the EDD and the work orders. */}
      <Section title={`Models (${models.length})`}>
        {models.length === 0 ? (
          <p className="text-sm text-steel-500">No model named on the task yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold text-steel-400">
                <tr>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">After moulding</th>
                  <th className="px-3 py-2">Production</th>
                  <th className="px-3 py-2">EDD</th>
                  <th className="px-3 py-2" title="The last team’s completion date for the model">Completion</th>
                  <th className="px-3 py-2">Work order</th>
                  <th className="px-3 py-2">Made with</th>
                </tr>
              </thead>
              <tbody>
                {models.map((row) => (
                  <tr key={row.model} className="border-t border-line/10 align-top">
                    <td className="px-3 py-2.5 font-semibold text-steel-50">{row.model}</td>
                    <td className="px-3 py-2.5 text-xs text-steel-300">
                      {row.decided ? ['Moulding', row.printing && 'Printing', row.assembly && 'Assembly'].filter(Boolean).join(' → ') : <span className="font-semibold text-warn-400">Not decided</span>}
                    </td>
                    <td className="px-3 py-2.5"><StatusCell status={row.production} needed /></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-steel-200">{row.edd ? formatDate(row.edd) : <span className="text-xs text-steel-500">—</span>}</td>
                    <td className={`whitespace-nowrap px-3 py-2.5 ${row.completion && row.edd && row.completion > row.edd ? 'font-semibold text-danger-400' : 'text-steel-200'}`}>
                      {row.completion ? formatDate(row.completion) : <span className="text-xs text-steel-500">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-steel-300">{row.workOrders.length ? row.workOrders.join(', ') : '—'}</td>
                    <td className="min-w-[13rem] px-3 py-2.5">
                      {specOf(row.model) ? (
                        <>
                          <PartsList parts={specOf(row.model).parts} />
                          {specOf(row.model).printReference && <div className="mt-1.5"><PrintReferenceView reference={specOf(row.model).printReference} /></div>}
                          <Link to={`/orders/${specOf(row.model).order._id}`} className="mt-1 inline-block text-xs text-steel-500 hover:text-accent">{specOf(row.model).order.number}</Link>
                        </>
                      ) : <span className="text-xs text-steel-500">No sales order line yet</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Production's updates: printing and assembly, the dates, each model's status and hand-over. */}
        <Section title="Production — update">
          <TaskFacts button={button} task={task} className="mb-3" />
          {works && !task.completed ? (
            <div className="space-y-3">
              <TaskEdd todo={task} mayAct onChanged={changed} />
              <TaskWorkflow todo={task} onChanged={changed} />
              <HandoffTaskActions todo={task} onChanged={changed} />
            </div>
          ) : (
            <p className="text-sm text-steel-400">{task.completed ? 'Production’s task is done.' : `Updated by ${departmentLabel(task.department)}${task.user?.name ? ` — ${task.user.name} has it` : ''}.`}</p>
          )}
          <div className="mt-4 border-t border-line/[0.06] pt-3">
            <TaskTimeline task={task} button={button} />
          </div>
        </Section>

        {/* The teams after Production, to read: their updates and the dates they gave — worked on their own desks. */}
        <Section title="Updates from the teams after Production">
          <div className="space-y-3">
            <TeamUpdates title="Printing" task={teams.printing} />
            <TeamUpdates title="Assembly" task={teams.assembling} />
            <TeamUpdates title="Quality" task={teams.quality} />
            <TeamUpdates title="Dispatch" task={teams.despatch} />
            {!teams.printing && !teams.assembling && !teams.quality && !teams.despatch && (
              <p className="text-sm text-steel-500">No team after Production yet — printing and assembly are decided on the left.</p>
            )}
          </div>
        </Section>
      </div>

      {/* The production record: a work order per released line, and what the presses are doing. */}
      <Section
        title={`Work orders (${workOrders.length})`}
        actions={orderId ? <Link to={`/work-orders?order=${orderId}`} className="text-xs font-semibold text-accent hover:underline">Open on Work orders</Link> : null}
      >
        {workOrders.length === 0 ? (
          <p className="text-sm text-steel-500">None yet — a work order is raised for each line when the sales order is released to production.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold text-steel-400">
                <tr>
                  <th className="px-3 py-2">Work order</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Made</th>
                  <th className="px-3 py-2">Press</th>
                  <th className="px-3 py-2">Planned</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.map((wo) => (
                  <tr key={wo._id} className="border-t border-line/10">
                    <td className="px-3 py-2.5"><WorkOrderChip wo={wo} orderId={orderId} /></td>
                    <td className="px-3 py-2.5 text-steel-200">{wo.modelNumber || '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums text-steel-200">{Number(wo.goodQty || 0).toLocaleString('en-IN')} / {Number(wo.quantity || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2.5 text-steel-300">{wo.machine || <Link to="/production/plan" className="text-xs text-accent hover:underline">Plan on a press</Link>}</td>
                    <td className="px-3 py-2.5 text-xs text-steel-400">{wo.plannedStart ? formatDate(wo.plannedStart) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-steel-200">{WORK_ORDER_STATUS[wo.status]?.label || wo.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(floor.running?.length > 0 || floor.made?.good > 0) && (
          <div className="mt-3 space-y-1 border-t border-line/[0.06] pt-3 text-sm">
            {(floor.running || []).map((run) => (
              <p key={run._id} className="font-semibold text-success-400">
                <span aria-hidden="true">● </span>{run.machine?.code || 'Press'} · {run.mould?.mouldCode || run.modelNumber || 'mould'} running since {formatDate(run.startedAt)}
                {run.piecesSoFar != null ? ` · ${Number(run.piecesSoFar).toLocaleString('en-IN')} so far` : ''}
              </p>
            ))}
            {floor.made?.good > 0 && <p className="text-steel-400">{Number(floor.made.good).toLocaleString('en-IN')} good made · {floor.made.rejected || 0} rejected · {floor.made.runs} run{floor.made.runs === 1 ? '' : 's'}</p>}
          </div>
        )}
      </Section>
    </div>
  );
}
