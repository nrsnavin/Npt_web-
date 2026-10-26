import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { formatDate } from '../utils/format.js';
import { dueWords, urgencyTone } from '../utils/deliveryUrgency.js';
import DeliveryUrgencyDialog from './DeliveryUrgencyDialog.jsx';
import TaskPanel from './TaskPanel.jsx';
import { DispatchModelList } from './DispatchModels.jsx';
import CustomerFilter, { QueuePlace, byCustomer, placesForTask, useQueuePlaces } from './CustomerFilter.jsx';

/**
 * The Dispatch desk as a table — one line a request, where the cards ran long. Each row: the
 * buyer, the enquiry and its SO, the models and pieces, whose buyer it is, marketing's EDD, the
 * delivery urgency (set by Admin or the request's marketing person, from the row), where the
 * request stands, whether the goods are ready and QC passed [server: handoff.controller
 * `withReadiness` `goods`], the booking, and who has it. "Update status" opens the task's own
 * workflow in the side panel; everything else on the card is there too.
 */

const ROUTE_WORDS = { production: 'Production', printing: 'Printing', assembling: 'Assembly' };
const idOf = (value) => String(value?._id || value || '');

/** "Ready", "Ready: CRF25 · with Assembly: CRF30", and the QC state beside it. */
function GoodsCell({ goods, status }) {
  if (!goods) return <span className="text-xs text-steel-500">{status?.readyForDispatch ? 'Ready' : '—'}</span>;
  const waiting = goods.waiting || [];
  const allReady = goods.ready.length > 0 && !waiting.length;
  return (
    <div className="space-y-0.5 text-xs">
      {allReady ? (
        <span className="font-semibold text-success-400">Ready{goods.ready.length > 1 ? ` · ${goods.ready.length} models` : ''}</span>
      ) : (
        <>
          {goods.ready.length > 0 && <p className="text-success-400">Ready: {goods.ready.join(', ')}</p>}
          <p className="text-warn-400">
            {/* Each model where it is now — in Production, with Printing or Assembly — and its status there [server: modelReadiness]. */}
            {waiting.length ? `Not ready: ${waiting.map((row) => `${row.model} (${row.team === 'production' ? 'in' : 'with'} ${ROUTE_WORDS[row.team] || row.team}${row.status ? ` · ${row.status}` : ''})`).join(', ')}` : 'Not ready yet'}
          </p>
        </>
      )}
      {goods.qc?.required && (
        goods.qc.atQc?.length
          ? <p className="font-semibold text-warn-400">QC pending{goods.qc.passed?.length ? ` · passed ${goods.qc.passed.join(', ')}` : ''}</p>
          : goods.qc.passed?.length ? <p className="text-success-400">QC passed</p> : <p className="text-warn-400">QC compulsory</p>
      )}
    </div>
  );
}

/* A row's buyer, for the customer filter. */
const buyerOf = (row) => row.enquiry?.customer?.name || row.task.customer?.name;

export default function DispatchTable({ rows: all = [], me, onChanged }) {
  /* One buyer's requests [CustomerFilter], and where each job stands in the plant's queues. */
  const [customerPick, setCustomerPick] = useState('');
  const places = useQueuePlaces();
  const rows = byCustomer(all, buyerOf, customerPick);
  const { isAdmin, isManagement, departments = [] } = useAuth();
  const catalogue = useHandoffCatalogue();
  const [setting, setSetting] = useState(null);
  const [opened, setOpened] = useState(null);
  /* Whoever works the Dispatch desk, Admin, or the person the request is with moves its status. */
  const mayWork = (task) => isAdmin || departments.includes(task.department) || idOf(task.user) === me;
  /* Only Admin and the request's marketing person give the urgency — Dispatch reads it [server: deliveryUrgency.service]. */
  const maySetUrgency = (row) => isManagement || idOf(row.enquiry ? row.enquiry.assignedTo : row.task.createdBy) === me;

  return (
    <div className="space-y-3">
    {all.length > 1 && (
      <div className="flex justify-end">
        <CustomerFilter rows={all} nameOf={buyerOf} value={customerPick} onChange={setCustomerPick} />
      </div>
    )}
    <div className="card relative overflow-x-auto p-0">
      <table className="w-full min-w-[68rem] text-left text-sm" aria-label="Dispatch requests">
        <thead className="border-b border-line/[0.08] text-xs font-semibold uppercase tracking-wide text-steel-400">
          <tr>
            <th className="px-3 py-2.5">Customer</th>
            <th className="px-3 py-2.5">Enquiry / SO</th>
            <th className="px-3 py-2.5">Models &amp; qty</th>
            <th className="px-3 py-2.5">Marketing</th>
            <th className="px-3 py-2.5">EDD</th>
            <th className="px-3 py-2.5">Urgency</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Goods / QC</th>
            <th className="px-3 py-2.5">Booking</th>
            <th className="px-3 py-2.5">With</th>
            <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { task, enquiry } = row;
            const statuses = buttonFor(catalogue, task.kind)?.form?.statuses || [];
            const status = statuses.find((entry) => entry.key === task.status) || null;
            const customer = enquiry?.customer?.name || task.customer?.name || '—';
            const models = task.brief?.models || task.brief?.model || enquiry?.requirement?.modelNumber || '';
            const quantity = task.brief?.quantity ? `${Number(String(task.brief.quantity).replace(/[^\d.]/g, '')).toLocaleString('en-IN')} pcs` : '';
            const edd = enquiry?.edd?.date || task.jobEdd?.date || null;
            const delivery = task.delivery?.urgency ? task.delivery : null;
            const late = Boolean(delivery?.dueBy && new Date(delivery.dueBy) < new Date());
            const isDefault = !delivery || Boolean(delivery.default);
            const about = [enquiry?.number || 'Team task', customer, models].filter(Boolean).join(' · ');
            return (
              <tr key={task._id} className={`border-b border-line/[0.05] align-top last:border-0 ${late ? 'bg-danger-500/[0.04]' : ''}`}>
                <td className="max-w-[12rem] px-3 py-2.5 font-semibold text-steel-50">
                  <span className="line-clamp-2">{customer}</span>
                  <QueuePlace places={placesForTask(places, task)} className="mt-0.5 font-normal" />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {enquiry ? <Link to={`/enquiries/${enquiry._id}`} className="font-semibold text-steel-100 hover:text-accent">{enquiry.number}</Link> : <span className="text-steel-300">Team task</span>}
                  {row.records?.order?.number && <span className="block text-xs text-steel-400">{row.records.order.number}</span>}
                </td>
                <td className="max-w-[12rem] px-3 py-2.5 text-steel-200">
                  <span className="line-clamp-2">{models || '—'}</span>
                  {quantity && <span className="block text-xs text-steel-400">{quantity}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-steel-300">{enquiry?.assignedTo?.name || task.createdBy?.name || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {edd ? <span className="tabular-nums text-steel-100">{formatDate(edd)}</span> : <span className="text-xs font-semibold text-danger-400">Not set</span>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${urgencyTone(delivery ? { ...delivery, late } : null)}`}>
                    {delivery?.label || 'Today'}{isDefault ? ' · default' : ''}
                  </span>
                  <span className={`block text-xs ${late ? 'font-semibold text-danger-400' : 'text-steel-500'}`}>{delivery ? dueWords({ ...delivery, late }) : 'The day it reached Dispatch'}</span>
                  {maySetUrgency(row) && (
                    <button type="button" className="link-muted mt-0.5 text-xs" onClick={() => setSetting({ task, delivery, isDefault, about })}>
                      {isDefault ? 'Set urgency' : 'Change urgency'}
                    </button>
                  )}
                </td>
                <td className="min-w-[14rem] px-3 py-2.5">
                  {/* Several models: each its own state — one part sent never reads as all of them part sent [server: `dispatchStateOf`]. */}
                  {row.dispatchModels?.length > 1 ? (
                    <DispatchModelList models={row.dispatchModels} compact />
                  ) : (
                    <>
                      <span className={`text-xs font-semibold ${status?.issue ? 'text-danger-400' : 'text-steel-100'}`}>{status?.label || 'Received'}</span>
                      {row.dispatchModels?.[0] && <span className="block text-xs text-steel-400">{row.dispatchModels[0].words}</span>}
                    </>
                  )}
                </td>
                <td className="px-3 py-2.5"><GoodsCell goods={row.goods} status={status} /></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-steel-300">{task.brief?.booking || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs">{task.user?.name ? <span className="text-steel-200">{task.user.name}</span> : <span className="text-warn-400">Not picked up</span>}</td>
                <td className="px-3 py-2.5 text-right">
                  <button type="button" className="btn-primary whitespace-nowrap px-3 py-1.5 text-xs" onClick={() => setOpened(task)}>
                    {mayWork(task) ? 'Update status' : 'Open'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {setting && (
        <DeliveryUrgencyDialog
          taskId={setting.task._id}
          current={setting.delivery?.urgency || 'today'}
          isDefault={setting.isDefault}
          about={setting.about}
          onClose={() => setSetting(null)}
          onSaved={onChanged}
        />
      )}
      {opened && (
        <TaskPanel
          task={opened}
          mayWork={mayWork(opened)}
          onClose={() => setOpened(null)}
          onChanged={() => { setOpened(null); onChanged?.(); }}
        />
      )}
    </div>
    </div>
  );
}
