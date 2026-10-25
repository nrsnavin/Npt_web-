import { useEffect, useState } from 'react';
import { files, workspace } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Section } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { AddPaper } from './LoadPaper.jsx';
import { formatDate } from '../utils/format.js';

/**
 * Shipments — every load Dispatch sent, one line each [server: handoff.service `shipmentsOf`,
 * records.service loads]: the day, the models and pieces, how it went, and its LR copy (or proof
 * of delivery). A transporter's shipment has its own LR, so three loads gone before Reception
 * looks are three LRs to upload — never one upload standing for all of them.
 */

const piecesWords = (lines = []) => lines.map((line) => `${line.model} ${Number(line.quantity || 0).toLocaleString('en-IN')} pcs`).join(' · ');
const howWords = (row) => [row.modeLabel || row.mode, row.transporter, row.lrNumber && `LR ${row.lrNumber}`, row.vehicleNumber].filter(Boolean).join(' · ');

/* The stored file, through the API — it needs the session's token. */
async function view(file) {
  const blob = await files.blob(file.key);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * On Reception's LR Copy task: each shipment of the job with its LR — Upload LR on the one still
 * waiting, Send to buyer on one uploaded but not sent. The task closes once every shipment has
 * its LR [server: `assertMayFinish`]. `onCount` tells the task how many shipments there are, so
 * the single upload button gives way to these.
 */
export function LrShipments({ todo, onUpload, onChanged, onCount }) {
  const { toast, warn } = useToast();
  const [rows, setRows] = useState(null);
  const [sending, setSending] = useState(null);
  useEffect(() => {
    let live = true;
    workspace.todos.shipments(todo._id).then((data) => {
      if (!live) return;
      setRows(data);
      onCount?.(data.filter((row) => row.needsLr).length);
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo._id, todo.updatedAt, todo.status, todo.resultFile]);
  const lrRows = (rows || []).filter((row) => row.needsLr);
  if (!lrRows.length) return null;
  const waiting = lrRows.filter((row) => !row.paper).length;

  const send = async (row) => {
    setSending(row._id);
    try {
      const answer = await workspace.todos.sendResult(todo._id, row._id);
      const went = (answer.sent || []).filter((entry) => entry.status === 'sent');
      if (went.length) toast('LR sent to the buyer', went.map((entry) => `${entry.channel === 'email' ? 'Email' : 'WhatsApp'} to ${entry.recipient}`).join(' · '));
      else warn('LR not sent', (answer.sent || []).map((entry) => String(entry.reason || entry.status).replaceAll('_', ' ')).join(' · ') || 'Nothing went');
      onChanged?.(answer.data);
    } catch (failure) {
      warn('LR not sent', failure.message);
    } finally {
      setSending(null);
    }
  };

  return (
    <section className="rounded-lg border border-line/[0.08] px-3 py-2" aria-label="Shipments and their LR">
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-wide text-steel-400">
        <span>Shipments · {lrRows.length}</span>
        <span className={`font-semibold normal-case tracking-normal ${waiting ? 'text-warn-400' : 'text-success-400'}`}>
          {waiting ? `${waiting} LR${waiting > 1 ? 's' : ''} to upload — the task closes once every shipment has its LR` : 'Every shipment has its LR'}
        </span>
      </p>
      <ul className="divide-y divide-line/[0.06]">
        {lrRows.map((row) => (
          <li key={row._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-steel-100">{formatDate(row.at)} · {piecesWords(row.lines)}</p>
              <p className="text-xs text-steel-400">{howWords(row)}</p>
            </div>
            <span className="flex flex-wrap items-center gap-1.5">
              {row.paper ? (
                <>
                  <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => view(row.paper)}>View LR</button>
                  {row.lrSentAt
                    ? <span className="text-xs font-semibold text-success-400">Sent to buyer · {formatDate(row.lrSentAt)}</span>
                    : <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={sending === row._id} onClick={() => send(row)}>{sending === row._id ? 'Sending…' : 'Send to buyer'}</button>}
                </>
              ) : (
                <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => onUpload(row)}>Upload LR</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * On the enquiry: every shipment of it, newest first, across its Dispatch requests [server:
 * records.service `describeDispatch` loads] — the day, the models and pieces, how it went, and the
 * LR (or proof of delivery) to open; "LR awaited from Reception" where it has not come yet.
 */
/** Dispatch and Reception add a shipment's proof of delivery or LR, from wherever it is seen — Admin too [server: `shipmentPaper`]. */
export function useMayAddPaper() {
  const { isManagement, departments = [] } = useAuth();
  return isManagement || departments.includes('despatch') || departments.includes('reception');
}

/** The button on a shipment still without its paper, and the upload it opens. `load.mode` is the mode's key. */
export function AddShipmentPaper({ load, onSaved }) {
  const mayAdd = useMayAddPaper();
  const [open, setOpen] = useState(false);
  if (!mayAdd) return null;
  return (
    <>
      <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => setOpen(true)}>{load.mode === 'transporter' ? 'Upload LR' : 'Upload proof'}</button>
      {open && <AddPaper load={load} onClose={() => setOpen(false)} onSaved={() => onSaved?.()} />}
    </>
  );
}

export function EnquiryShipments({ data, onChanged }) {
  const rows = (data?.dispatch?.requests || [])
    .flatMap((request) => (request.loads || []).map((load) => ({ ...load, order: request.order })))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!rows.length) return null;
  const pieces = rows.reduce((sum, row) => sum + row.lines.reduce((total, line) => total + (line.quantity || 0), 0), 0);
  return (
    <Section title={`Shipments (${rows.length})`} actions={<span className="text-xs text-steel-400">{pieces.toLocaleString('en-IN')} pcs sent in all</span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm" aria-label="Shipments">
          <thead className="border-b border-line/[0.08] text-xs font-semibold uppercase tracking-wide text-steel-400">
            <tr>
              <th className="py-2 pr-3">Date</th>
              <th className="py-2 pr-3">Models &amp; pieces</th>
              <th className="py-2 pr-3">How</th>
              <th className="py-2">LR / proof</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row._id} className="border-b border-line/[0.05] align-top last:border-0">
                <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-steel-100">{formatDate(row.at)}</td>
                <td className="py-2 pr-3">
                  {row.lines.map((line) => (
                    <span key={line.model} className="block text-steel-100"><span className="font-semibold">{line.model}</span> · {Number(line.quantity || 0).toLocaleString('en-IN')} pcs</span>
                  ))}
                  {row.order?.number && <span className="block text-xs text-steel-500">{row.order.number}</span>}
                </td>
                <td className="py-2 pr-3 text-xs text-steel-300">{[row.mode, row.transporter, row.lrNumber && `LR ${row.lrNumber}`, row.vehicleNumber].filter(Boolean).join(' · ') || '—'}</td>
                <td className="py-2 text-xs">
                  {row.proof ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <button type="button" className="row-action px-2 py-1 text-xs" onClick={() => view(row.proof)}>{row.needsLr ? 'View LR' : 'View proof'}</button>
                      {row.needsLr && (row.lrSentAt ? <span className="text-success-400">Sent to buyer {formatDate(row.lrSentAt)}</span> : <span className="text-warn-400">Not sent to buyer yet</span>)}
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-warn-400">{row.needsLr ? 'LR awaited from Reception' : 'Proof to come'}</span>
                      <AddShipmentPaper load={{ ...row, mode: row.modeKey || (row.needsLr ? 'transporter' : 'own_vehicle') }} onSaved={onChanged} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
