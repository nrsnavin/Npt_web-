import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { files as filesApi, workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { buttonFor, useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { formatCurrency, formatDate } from '../utils/format.js';
import { statusesFor } from '../utils/edd.js';
import { Modal, Notice } from './ui.jsx';
import CloseTaskPrompt, { offersClose } from './CloseTaskPrompt.jsx';
import TaskPanel from './TaskPanel.jsx';
import { CommentDialog, ContactDialog, MoveForm, UploadDialog } from './TaskWorkflow.jsx';

/**
 * The Reception, Payment Collection, Payment Recovery and Accounts desks as tables — one line a
 * task, and the work done on the line [server: deskDetails.service `withDeskDetails`]:
 *
 *   Reception           two tables: the samples the buyer collects (the sample, the buyer to call,
 *                       the enquiry and its marketing person, the hand-over with who took it and
 *                       the slip photo) and the LR copies (invoice and LR number — editable —, the
 *                       transporter and vehicle, when it went and how much, the delivery contact,
 *                       the LR upload and whether it reached the buyer);
 *   Payment Collection  what is due and how late, the promise and the next call, the contact to
 *                       ring or WhatsApp, and Log payment;
 *   Payment Recovery    who visits and when, what is due and what came in, the promise;
 *   Accounts            the enquiry / SO and its value, who asked and what, the payment logged,
 *                       the buyer's credit and what they owe.
 *
 * Every table: the customer, the status — picked from the row, the remark, date or amount it needs
 * asked in a small pop-up [TaskWorkflow `MoveForm`] — and the due date, red when late. "Open"
 * opens the whole task in the side panel.
 */

const idOf = (value) => String(value?._id || value || '');
const digits = (phone) => String(phone || '').replace(/\D/g, '');
const waNumber = (phone) => {
  const plain = digits(phone);
  return plain.length === 10 ? `91${plain}` : plain;
};

/** The task kinds each desk's tables take; anything else on the desk stays a card. */
export const DESK_TABLE_KINDS = {
  reception: ['sample_collect', 'lr_copy'],
  payment_collection: ['team_payment_followup', 'my_payment_followup'],
  payment_recovery: ['prt_recovery', 'request_prt_visit'],
  accounts: ['ac_clarify'],
};
export const takesTable = (department, row) => Boolean(DESK_TABLE_KINDS[department]?.includes(row.task.kind));

/** A file on the record, opened in a new tab — the route needs the session, so it is fetched first. */
function FileLink({ file, children }) {
  if (!file?.key) return null;
  const open = async () => {
    const url = URL.createObjectURL(await filesApi.blob(file.key));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={open}>{children || file.filename || 'File'}</button>;
}

/** Call and WhatsApp, from the row. */
function PhoneLinks({ phone, whatsapp }) {
  if (!phone && !whatsapp) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
      {phone && <a className="font-semibold text-accent hover:underline" href={`tel:${digits(phone)}`}>Call {phone}</a>}
      {(whatsapp || phone) && <a className="font-semibold text-success-400 hover:underline" href={`https://wa.me/${waNumber(whatsapp || phone)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
    </span>
  );
}

function DueCell({ row }) {
  const due = row.task.dueDate;
  if (!due) return <span className="text-xs text-steel-500">—</span>;
  if (row.late) return <span className="whitespace-nowrap text-xs font-bold text-danger-400">{formatDate(due)} · Late</span>;
  if (row.dueToday) return <span className="whitespace-nowrap text-xs font-semibold text-warn-400">Today</span>;
  return <span className="whitespace-nowrap text-xs tabular-nums text-steel-300">{formatDate(due)}</span>;
}

const CREDIT_TONE = { good: 'bg-success-500/15 text-success-400', watch: 'bg-warn-500/15 text-warn-400', hold: 'bg-danger-500/15 text-danger-400' };
const CREDIT_WORD = { good: 'Good', watch: 'Watch', hold: 'Hold' };

/**
 * A status picked from the row, moved the way the task's own workflow moves it: a PDF step asks
 * for the file, a comment step for the comment, a step that says why or when (or records an
 * amount, or who collected) opens the small pop-up first, anything else moves at once.
 */
function useRowMove({ task, button, onChanged }) {
  const catalogue = useHandoffCatalogue();
  const { toast, warn } = useToast();
  const form = button?.form || {};
  const statuses = statusesFor(task, form.statuses || []);
  const [moving, setMoving] = useState(null);
  const [asking, setAsking] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [offer, setOffer] = useState(null);
  const [problem, setProblem] = useState(null);
  const moved = (saved) => {
    onChanged?.(saved);
    if (offersClose(saved)) setOffer(saved);
  };
  const choose = async (key) => {
    const step = statuses.find((entry) => entry.key === key);
    if (!step || key === task.status) return;
    setProblem(null);
    if (step.pdf) { setUploading(true); return; }
    if (step.comment) { setAsking(step); return; }
    if (form.remarkRequired || form.statusDate || step.fields?.length || step.tellBuyer || step.date) { setMoving(step); return; }
    try {
      moved(await workspace.todos.status({ id: task._id, status: key }));
    } catch (failure) {
      setProblem(failure.message);
    }
  };
  const resultStep = statuses.find((entry) => entry.pdf);
  const dialogs = (
    <>
      {moving && (
        <Modal open title={moving.label} description={form.notifyStatus ? 'The enquiry’s marketing person and Admin are told.' : undefined} onClose={() => setMoving(null)}>
          <MoveForm
            todo={task}
            form={form}
            step={moving}
            onCancel={() => setMoving(null)}
            onMoved={(saved) => {
              if (saved?.completed) toast(moving.label, 'The task is finished.');
              setMoving(null);
              moved(saved);
            }}
          />
        </Modal>
      )}
      {asking && (
        <CommentDialog
          step={asking}
          target={asking.raises ? buttonFor(catalogue, asking.raises) : null}
          onClose={() => setAsking(null)}
          onSave={async (note) => moved(await workspace.todos.status({ id: task._id, status: asking.key, note }))}
        />
      )}
      {uploading && resultStep && (
        <UploadDialog
          title={form.resultLabel || 'Upload the PDF'}
          step={resultStep}
          todo={task}
          form={form}
          onClose={() => setUploading(false)}
          onDone={(answer) => {
            const channel = (entry) => (entry.channel === 'email' ? 'Email' : 'WhatsApp');
            const went = (answer.sent || []).filter((entry) => entry.status === 'sent');
            const missed = (answer.sent || []).filter((entry) => entry.status !== 'sent');
            if (went.length) toast(`${form.resultTitle || 'File'} sent to the buyer`, went.map((entry) => `${channel(entry)} to ${entry.recipient}`).join(' · '));
            if (missed.length) warn(`${missed.map(channel).join(' and ')} not sent`, missed.map((entry) => `${channel(entry)}: ${String(entry.reason || entry.status).replaceAll('_', ' ')}`).join(' · '));
            if (!answer.sent) toast(resultStep.label, 'Uploaded.');
            onChanged?.(answer.data);
          }}
        />
      )}
      {editing && (
        <ContactDialog
          fields={(button?.asks || []).filter((field) => field.editable)}
          todo={task}
          title={form.editLabel}
          onClose={() => setEditing(false)}
          onSaved={(saved) => onChanged?.(saved)}
        />
      )}
      {offer && (
        <CloseTaskPrompt
          task={offer}
          why={offer.closable?.why}
          onClose={() => setOffer(null)}
          onClosed={(saved) => {
            toast('Task closed', offer.closable?.why || 'Nothing was left to do.');
            onChanged?.(saved);
          }}
        />
      )}
    </>
  );
  return { statuses, choose, problem, dialogs, upload: () => setUploading(true), edit: () => setEditing(true), resultStep };
}

/** The status, changed from the row by whoever works the task. */
function StatusCell({ task, move, mayWork }) {
  const current = move.statuses.find((entry) => entry.key === task.status);
  if (!mayWork || !move.statuses.length) {
    return <span className={`text-xs font-semibold ${current?.issue ? 'text-danger-400' : 'text-steel-100'}`}>{current?.label || 'Open'}</span>;
  }
  return (
    <div>
      <select
        aria-label={`Status of ${task.title || 'the task'}`}
        className={`input w-full min-w-[10rem] py-1.5 text-xs ${current?.issue ? 'text-danger-400' : ''}`}
        value={task.status || ''}
        onChange={(event) => move.choose(event.target.value)}
      >
        {!current && <option value="">Open</option>}
        {move.statuses.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
      </select>
      {move.problem && <p className="mt-1 text-xs text-danger-400">{move.problem}</p>}
    </div>
  );
}

/** Uploads a paper onto the task from the row [server: handoff.controller task documents]. */
function UploadPaper({ task, kind, label, onChanged }) {
  const picker = useRef(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const { toast } = useToast();
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { setProblem('Over 1 MB — take a smaller photo'); return; }
    setBusy(true);
    setProblem(null);
    try {
      await workspace.todos.addDocument({ id: task._id, docType: kind, file });
      toast(`${label} uploaded`, 'Kept on the task.');
      onChanged?.();
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="link-muted text-xs" disabled={busy} onClick={() => picker.current?.click()}>{busy ? 'Uploading…' : `Upload ${label.toLowerCase()}`}</button>
      <input ref={picker} type="file" accept="application/pdf,image/jpeg,image/png" capture="environment" className="hidden" aria-label={`Choose the ${label.toLowerCase()}`} onChange={upload} />
      {problem && <span className="block text-xs text-danger-400">{problem}</span>}
    </>
  );
}

const th = 'px-3 py-2.5';
const td = 'px-3 py-2.5';

/** One table: the header, a row component a task, the side panel. */
function Table({ label, headers, rows, line, minWidth = '64rem', me, onChanged }) {
  /* The row component this table draws a task with. */
  const Line = line;
  const { isAdmin, departments = [] } = useAuth();
  const catalogue = useHandoffCatalogue();
  const [opened, setOpened] = useState(null);
  const mayWork = (task) => isAdmin || departments.includes(task.department) || idOf(task.user) === me;
  return (
    <div className="card relative overflow-x-auto p-0">
      <table className="w-full text-left text-sm" style={{ minWidth }} aria-label={label}>
        <thead className="border-b border-line/[0.08] text-xs font-semibold uppercase tracking-wide text-steel-400">
          <tr>
            {headers.map((header) => <th key={header} className={th}>{header}</th>)}
            <th className={th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Line
              key={row.task._id}
              row={row}
              button={buttonFor(catalogue, row.task.kind)}
              mayWork={mayWork(row.task)}
              onOpen={() => setOpened(row.task)}
              onChanged={onChanged}
            />
          ))}
        </tbody>
      </table>
      {opened && (
        <TaskPanel
          task={opened}
          mayWork={mayWork(opened)}
          onClose={() => setOpened(null)}
          onChanged={() => { setOpened(null); onChanged?.(); }}
        />
      )}
    </div>
  );
}

const rowClass = (row) => `border-b border-line/[0.05] align-top last:border-0 ${row.late ? 'bg-danger-500/[0.04]' : ''}`;
const customerOf = (row) => row.enquiry?.customer?.name || row.task.customer?.name || '—';

function CustomerCell({ row, children }) {
  return (
    <td className={`max-w-[12rem] ${td}`}>
      <span className="line-clamp-2 font-semibold text-steel-50">{customerOf(row)}</span>
      {children}
    </td>
  );
}

function OpenCell({ onOpen, mayWork, children }) {
  return (
    <td className={`${td} text-right`}>
      <div className="flex flex-col items-end gap-1.5">
        {children}
        <button type="button" className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs" onClick={onOpen}>{mayWork ? 'Open / update' : 'Open'}</button>
      </div>
    </td>
  );
}

function EnquiryLink({ row }) {
  return row.enquiry
    ? <Link to={`/enquiries/${row.enquiry._id}`} className="font-semibold text-steel-100 hover:text-accent">{row.enquiry.number}</Link>
    : <span className="text-steel-300">Team task</span>;
}

/* ─────────────── Reception: samples the buyer collects ─────────────── */

function SampleRow({ row, button, mayWork, onOpen, onChanged }) {
  const { task } = row;
  const move = useRowMove({ task, button, onChanged });
  const brief = task.brief || {};
  const sample = row.sample;
  const given = sample?.collection || {};
  const photo = (row.documents || []).find((paper) => paper.docType === 'handover_photo') || (given.photo?.key ? given.photo : null);
  const handed = Boolean(given.collectedAt) || ['handed', 'closed'].includes(task.status);
  const handStep = move.statuses.find((entry) => entry.handsOver || entry.key === 'handed');
  return (
    <tr className={rowClass(row)}>
      <CustomerCell row={row} />
      <td className={`max-w-[13rem] ${td}`}>
        {sample ? <Link to={`/samples/${sample._id}`} className="font-semibold text-steel-100 hover:text-accent">{sample.number}</Link> : <span className="font-semibold text-steel-100">{brief.sampleNumber || '—'}</span>}
        {brief.models && <span className="line-clamp-2 block text-xs text-steel-300">{brief.models}</span>}
        {brief.pieces && <span className="block text-xs text-steel-400">{brief.pieces} pcs</span>}
      </td>
      <td className={`max-w-[13rem] ${td}`}>
        <span className="line-clamp-2 text-xs text-steel-200">{row.buyer?.contact || brief.buyerContact || '—'}</span>
        <PhoneLinks phone={row.buyer?.phone} whatsapp={row.buyer?.whatsapp} />
      </td>
      <td className={`whitespace-nowrap ${td}`}>
        <EnquiryLink row={row} />
        <span className="block text-xs text-steel-400">{row.enquiry?.assignedTo?.name || task.createdBy?.name || '—'}</span>
      </td>
      <td className={td}><StatusCell task={task} move={move} mayWork={mayWork} /></td>
      <td className={`max-w-[14rem] ${td}`}>
        {handed && given.collectorName ? (
          <div className="text-xs">
            <p className="font-semibold text-success-400">{given.collectorName}</p>
            <p className="text-steel-400">{[given.collectorPhone, given.pieces ? `${given.pieces} pcs` : null, given.collectedAt ? formatDate(given.collectedAt) : null].filter(Boolean).join(' · ')}</p>
          </div>
        ) : mayWork && handStep ? (
          <button type="button" className="btn-primary px-2.5 py-1 text-xs" onClick={() => move.choose(handStep.key)}>Hand over</button>
        ) : <span className="text-xs text-steel-500">Not handed yet</span>}
        <div className="mt-1">
          {photo ? <FileLink file={photo}>Hand-over photo</FileLink> : mayWork && <UploadPaper task={task} kind="handover_photo" label="Photo / slip" onChanged={onChanged} />}
        </div>
      </td>
      <td className={td}><DueCell row={row} /></td>
      <OpenCell onOpen={onOpen} mayWork={mayWork} />
      {move.dialogs}
    </tr>
  );
}

/* ─────────────── Reception: LR copies ─────────────── */

const SENT_ON = ['sent', 'in_transit', 'delivered', 'closed'];

function LrRow({ row, button, mayWork, onOpen, onChanged }) {
  const { task } = row;
  const move = useRowMove({ task, button, onChanged });
  const brief = task.brief || {};
  const sent = SENT_ON.includes(task.status) || (task.statusHistory || []).some((entry) => entry.status === 'sent');
  const notSent = !sent && [...(task.updates || [])].reverse().find((entry) => entry.kind === 'notice');
  const editable = (button?.asks || []).some((field) => field.editable);
  return (
    <tr className={rowClass(row)}>
      <CustomerCell row={row} />
      <td className={`whitespace-nowrap ${td}`}>
        <EnquiryLink row={row} />
        {row.records?.order?.number && <span className="block text-xs text-steel-400">{row.records.order.number}</span>}
      </td>
      <td className={`whitespace-nowrap ${td} text-xs`}>
        <p className="text-steel-100">Inv {brief.invoiceNumber || <span className="text-warn-400">—</span>}</p>
        <p className="text-steel-300">LR {brief.lrNumber || <span className="text-warn-400">—</span>}</p>
        {mayWork && editable && <button type="button" className="link-muted mt-0.5 text-xs" onClick={move.edit}>Edit</button>}
      </td>
      <td className={`max-w-[11rem] ${td} text-xs`}>
        <p className="line-clamp-2 text-steel-200">{brief.transporter || '—'}</p>
        {brief.vehicleNumber && <p className="text-steel-400">{brief.vehicleNumber}</p>}
      </td>
      <td className={`whitespace-nowrap ${td} text-xs`}>
        <p className="text-steel-200">{brief.dispatchedOn ? formatDate(brief.dispatchedOn) : '—'}</p>
        {brief.quantity && <p className="text-steel-400">{Number(String(brief.quantity).replace(/[^\d.]/g, '')).toLocaleString('en-IN')} pcs</p>}
      </td>
      <td className={`max-w-[13rem] ${td}`}>
        <span className="line-clamp-3 text-xs text-steel-300">{brief.delivery || '—'}</span>
        <PhoneLinks phone={row.buyer?.phone} whatsapp={row.buyer?.whatsapp} />
      </td>
      <td className={td}><StatusCell task={task} move={move} mayWork={mayWork} /></td>
      <td className={`max-w-[12rem] ${td}`}>
        {task.resultFile ? <FileLink file={task.resultFile}>LR copy</FileLink> : <span className="text-xs text-warn-400">No LR yet</span>}
        <p className={`text-xs ${sent ? 'font-semibold text-success-400' : notSent ? 'text-warn-400' : 'text-steel-500'}`}>
          {sent ? 'Sent to buyer' : notSent ? `Not sent — ${notSent.text || notSent.note}` : 'Not sent to buyer'}
        </p>
        {mayWork && move.resultStep && (
          <button type="button" className="btn-primary mt-1 px-2.5 py-1 text-xs" onClick={move.upload}>{task.resultFile ? 'Upload again' : 'Upload LR'}</button>
        )}
      </td>
      <td className={td}><DueCell row={row} /></td>
      <OpenCell onOpen={onOpen} mayWork={mayWork} />
      {move.dialogs}
    </tr>
  );
}

/* ─────────────── Payment Collection ─────────────── */

function MoneyDue({ money }) {
  if (!money) return <span className="text-xs text-steel-500">—</span>;
  if (!money.invoices) return <span className="text-xs text-success-400">Nothing owing</span>;
  return (
    <div className="text-xs">
      <p className="font-semibold tabular-nums text-steel-50">{formatCurrency(money.due)}</p>
      <p className={money.overdueDays > 0 ? 'font-semibold text-danger-400' : 'text-steel-400'}>
        {money.overdueDays > 0 ? `${money.overdueDays} day${money.overdueDays === 1 ? '' : 's'} overdue` : 'Not due yet'}
        {money.invoices > 1 ? ` · ${money.invoices} invoices` : ''}
      </p>
    </div>
  );
}

function PromiseCell({ row, withCall = true }) {
  const money = row.money || {};
  const brief = row.task.brief || {};
  const promised = money.promisedDate || brief.promisedDate;
  const broken = promised && new Date(promised) < new Date(new Date().toDateString());
  const call = money.nextCall || brief.callOn;
  return (
    <div className="whitespace-nowrap text-xs">
      <p className={broken ? 'font-semibold text-danger-400' : 'text-steel-100'}>
        {promised ? `Promised ${formatDate(promised)}` : 'No promise'}
        {money.promisedAmount ? ` · ${formatCurrency(money.promisedAmount)}` : ''}
      </p>
      {withCall && <p className="text-steel-400">{call ? `Next call ${formatDate(call)}` : 'No call fixed'}</p>}
    </div>
  );
}

function CollectionRow({ row, button, mayWork, onOpen, onChanged }) {
  const { task } = row;
  const move = useRowMove({ task, button, onChanged });
  const logStep = move.statuses.find((entry) => entry.confirmsInward);
  return (
    <tr className={rowClass(row)}>
      <CustomerCell row={row}>
        <span className="block text-xs text-steel-400">
          {row.enquiry ? row.enquiry.number : 'Team task'}{row.records?.order?.number ? ` · ${row.records.order.number}` : ''}
          {task.kind === 'my_payment_followup' ? ' · My follow-up' : ''}
        </span>
      </CustomerCell>
      <td className={td}><MoneyDue money={row.money} /></td>
      <td className={td}><PromiseCell row={row} /></td>
      <td className={`max-w-[13rem] ${td}`}>
        <span className="line-clamp-2 text-xs text-steel-200">{row.buyer?.contact || task.brief?.contact || '—'}</span>
        <PhoneLinks phone={row.buyer?.phone || task.brief?.contact} whatsapp={row.buyer?.whatsapp} />
      </td>
      <td className={td}><StatusCell task={task} move={move} mayWork={mayWork} /></td>
      <td className={td}><DueCell row={row} /></td>
      <OpenCell onOpen={onOpen} mayWork={mayWork}>
        {mayWork && logStep && (task.order
          ? <button type="button" className="btn-primary whitespace-nowrap px-3 py-1.5 text-xs" onClick={() => move.choose(logStep.key)}>Log payment</button>
          : <Link to="/payments" className="btn-primary whitespace-nowrap px-3 py-1.5 text-xs" title="Not on a sales order — record the receipt in Payments">Log payment</Link>)}
      </OpenCell>
      {move.dialogs}
    </tr>
  );
}

/* ─────────────── Payment Recovery (PRT) ─────────────── */

function RecoveryRow({ row, button, mayWork, onOpen, onChanged }) {
  const { task } = row;
  const move = useRowMove({ task, button, onChanged });
  const brief = task.brief || {};
  const visitor = brief.visitor || task.user?.name;
  const money = row.money;
  return (
    <tr className={rowClass(row)}>
      <CustomerCell row={row}>
        <span className="block text-xs text-steel-400">{row.enquiry ? row.enquiry.number : 'Team task'}</span>
        <PhoneLinks phone={row.buyer?.phone} whatsapp={row.buyer?.whatsapp} />
      </CustomerCell>
      <td className={`whitespace-nowrap ${td} text-xs`}>
        <p className={visitor ? 'font-semibold text-steel-100' : 'text-warn-400'}>{visitor || 'Nobody named'}</p>
        <p className="text-steel-400">{brief.visitDate ? `Visit ${formatDate(brief.visitDate)}` : 'No visit fixed'}</p>
      </td>
      <td className={`whitespace-nowrap ${td} text-xs`}>
        {money ? (
          <>
            <p className="font-semibold tabular-nums text-steel-50">Due {formatCurrency(money.due)}</p>
            <p className={money.collected > 0 ? 'font-semibold text-success-400' : 'text-steel-400'}>Collected {formatCurrency(money.collected)}</p>
            {money.overdueDays > 0 && <p className="text-danger-400">{money.overdueDays} days overdue</p>}
          </>
        ) : '—'}
      </td>
      <td className={td}><PromiseCell row={row} withCall={false} /></td>
      <td className={td}><StatusCell task={task} move={move} mayWork={mayWork} /></td>
      <td className={td}><DueCell row={row} /></td>
      <OpenCell onOpen={onOpen} mayWork={mayWork} />
      {move.dialogs}
    </tr>
  );
}

/* ─────────────── Accounts (A/C Clarify) ─────────────── */

function AccountsRow({ row, button, mayWork, onOpen, onChanged }) {
  const { task } = row;
  const move = useRowMove({ task, button, onChanged });
  const money = row.money || {};
  const paid = money.lastPayment;
  const credit = row.buyer?.credit?.status || 'good';
  const question = task.notes || (task.updates || []).at(-1)?.note;
  return (
    <tr className={rowClass(row)}>
      <CustomerCell row={row} />
      <td className={`whitespace-nowrap ${td}`}>
        <EnquiryLink row={row} />
        {(money.order?.number || row.records?.order?.number) && <span className="block text-xs text-steel-400">{money.order?.number || row.records.order.number}</span>}
        {money.order?.value > 0 && <span className="block text-xs tabular-nums text-steel-200">{formatCurrency(money.order.value)}</span>}
      </td>
      <td className={`max-w-[16rem] ${td}`}>
        <p className="text-xs font-semibold text-steel-100">{task.createdBy?.name || '—'}</p>
        {question && <p className="line-clamp-3 text-xs text-steel-300">“{question}”</p>}
      </td>
      <td className={`whitespace-nowrap ${td} text-xs`}>
        {paid ? (
          <>
            <p className="font-semibold tabular-nums text-steel-50">{formatCurrency(paid.amount)} · {String(paid.mode || '').toUpperCase()}</p>
            <p className="text-steel-400">{paid.reference ? `Ref ${paid.reference}` : 'No reference'} · {formatDate(paid.receivedAt)}</p>
            <p className={paid.confirmed ? 'text-success-400' : 'text-warn-400'}>{paid.confirmed ? 'Confirmed' : 'Not confirmed yet'}</p>
          </>
        ) : <span className="text-steel-500">No payment logged</span>}
      </td>
      <td className={`whitespace-nowrap ${td} text-xs`}>
        <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${CREDIT_TONE[credit] || CREDIT_TONE.good}`}>{CREDIT_WORD[credit] || credit}</span>
        <p className="mt-0.5 tabular-nums text-steel-200">Owes {formatCurrency(money.invoices ? money.due : row.buyer?.outstanding || 0)}</p>
        {money.overdueDays > 0 && <p className="text-danger-400">{money.overdueDays} days overdue</p>}
      </td>
      <td className={td}><StatusCell task={task} move={move} mayWork={mayWork} /></td>
      <td className={td}><DueCell row={row} /></td>
      <OpenCell onOpen={onOpen} mayWork={mayWork} />
      {move.dialogs}
    </tr>
  );
}

function Titled({ title, count, children }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-steel-300">{title} <span className="font-normal normal-case tabular-nums text-steel-500">{count}</span></h2>
      {children}
    </div>
  );
}

/** The desk's tables — Reception's two, one for every other desk. */
export default function DeskTables({ department, rows = [], me, onChanged }) {
  const props = { me, onChanged };
  if (department === 'reception') {
    const samples = rows.filter((row) => row.task.kind === 'sample_collect');
    const copies = rows.filter((row) => row.task.kind === 'lr_copy');
    return (
      <div className="space-y-5">
        {samples.length > 0 && (
          <Titled title="Samples to hand over" count={samples.length}>
            <Table label="Samples the buyer collects" rows={samples} line={SampleRow} minWidth="70rem" {...props}
              headers={['Customer', 'Sample & models', 'Buyer contact', 'Enquiry & marketing', 'Status', 'Hand-over', 'Due']} />
          </Titled>
        )}
        {copies.length > 0 && (
          <Titled title="LR copies" count={copies.length}>
            <Table label="LR copies" rows={copies} line={LrRow} minWidth="78rem" {...props}
              headers={['Customer', 'Enquiry / SO', 'Invoice & LR no.', 'Transporter & vehicle', 'Dispatched & qty', 'Delivery contact', 'Status', 'LR copy', 'Due']} />
          </Titled>
        )}
      </div>
    );
  }
  if (department === 'payment_collection') {
    return <Table label="Payment follow-ups" rows={rows} line={CollectionRow} minWidth="62rem" {...props}
      headers={['Customer', 'Amount due', 'Promise & next call', 'Contact', 'Status', 'Due']} />;
  }
  if (department === 'payment_recovery') {
    return <Table label="PRT cases" rows={rows} line={RecoveryRow} minWidth="60rem" {...props}
      headers={['Customer', 'Visitor & visit', 'Due / collected', 'Promised', 'Status', 'Due']} />;
  }
  if (department === 'accounts') {
    return <Table label="A/C Clarify" rows={rows} line={AccountsRow} minWidth="72rem" {...props}
      headers={['Customer', 'Enquiry / SO & amount', 'Asked by & question', 'Payment reference', 'Credit & outstanding', 'Status', 'Due']} />;
  }
  return <Notice tone="info">No table for this desk.</Notice>;
}
