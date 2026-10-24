import { useState } from 'react';
import DeliveryUrgencyDialog from './DeliveryUrgencyDialog.jsx';
import { dueWords, urgencyTone } from '../utils/deliveryUrgency.js';

/**
 * How soon the buyer needs a Dispatch request's goods, asked where marketing and Admin work — the
 * enquiry page and the task itself [server: deliveryUrgency.service]. Until somebody gives it,
 * the request reads Today, the day it reached Dispatch, marked as the default; marketing or Admin
 * confirms or changes it here. Everyone else (Dispatch) reads it and cannot change it.
 */
export default function DeliveryUrgencyPrompt({ task, maySet, about, onSaved }) {
  const [open, setOpen] = useState(false);
  if (!task || task.kind !== 'invoice_dispatch' || task.completed) return null;
  const delivery = task.delivery?.urgency ? task.delivery : null;
  const isDefault = !delivery || Boolean(delivery.default);
  const late = Boolean(delivery?.dueBy && new Date(delivery.dueBy) < new Date());
  const shown = delivery ? { ...delivery, late } : null;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${isDefault && maySet ? 'border-warn-500/40 bg-warn-500/[0.07]' : 'border-line/[0.1] bg-line/[0.02]'}`}
      aria-label="Delivery urgency"
    >
      <div className="text-sm text-steel-100">
        <span className="font-bold">Delivery urgency</span>
        {' '}
        <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${urgencyTone(shown)}`}>{delivery?.label || 'Today'}{isDefault ? ' · default' : ''}</span>
        <p className={`text-xs ${late ? 'font-semibold text-danger-400' : 'text-steel-400'}`}>
          {shown ? dueWords(shown) : 'Due the day it reached Dispatch'}
          {isDefault
            ? ` — the default: the day it reached Dispatch.${maySet ? ' Confirm it, or say how soon the buyer needs it.' : ' Waiting for marketing to confirm.'}`
            : delivery?.note ? ` — “${delivery.note}”` : ''}
        </p>
      </div>
      {maySet && (
        <button type="button" className={isDefault ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-secondary px-3 py-1.5 text-xs'} onClick={() => setOpen(true)}>
          {isDefault ? 'Confirm or change' : 'Change urgency'}
        </button>
      )}
      {open && (
        <DeliveryUrgencyDialog
          taskId={task._id}
          current={delivery?.urgency || 'today'}
          isDefault={isDefault}
          about={about || task.title}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
