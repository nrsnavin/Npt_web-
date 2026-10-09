import { useCallback, useEffect, useState } from 'react';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { FormError } from './ui.jsx';
import MarketingStatusSelect from './MarketingStatusSelect.jsx';
import { formatWhen } from './EnquiryActivities.jsx';
import { marketingStatusLabel, stageLabel } from '../utils/pipeline.js';

/**
 * The enquiry's side panel: where it stands with marketing, writing to the buyer on the company
 * WhatsApp number and the company mail, and everything that happened, in a timeline that folds
 * away [server: controllers/enquiryMessage.controller.js].
 *
 * Only the person the enquiry is assigned to writes and reads the conversation. Admin and the
 * departments see on the timeline that a message went — not what it said.
 */

const ACTIVITY_LABEL = { call: 'Call', whatsapp: 'WhatsApp', email: 'Email', visit: 'Visit', meeting: 'Meeting' };
const NOTICE_LABEL = { sample_ready: 'Sample ready', sample_dispatched: 'Sample dispatched' };

/** One timeline entry as a heading and a line under it. */
export function describeEntry(entry) {
  switch (entry.kind) {
    case 'stage':
      return {
        title: entry.from ? `Stage: ${stageLabel(entry.from)} → ${stageLabel(entry.to)}` : `Stage: raised as ${stageLabel(entry.to)}`,
        detail: entry.note,
      };
    case 'marketing':
      return { title: `Marketing: ${entry.title || marketingStatusLabel(entry.to)}`, detail: entry.note };
    case 'activity':
      return {
        title: `${ACTIVITY_LABEL[entry.type] || entry.type}${entry.spokeTo ? ` · ${entry.spokeTo}` : ''}`,
        detail: entry.note,
      };
    case 'handover':
      return { title: `Handed from ${entry.from || '—'} to ${entry.to || '—'}`, detail: entry.note };
    case 'sample':
      return { title: `${entry.department}: ${entry.title}`, detail: entry.note };
    case 'notice':
      return {
        title: `Buyer told automatically: ${NOTICE_LABEL[entry.event] || entry.event}`,
        detail: entry.channel === 'whatsapp' ? 'On WhatsApp' : 'By email',
      };
    default:
      return { title: entry.kind, detail: null };
  }
}

function Card({ title, children }) {
  return (
    <section className="card min-w-0 p-5">
      <p className="mb-3 text-sm font-bold text-steel-50">{title}</p>
      {children}
    </section>
  );
}

/** A folding section: the heading is the button. */
function Fold({ title, count, open, onToggle, children }) {
  return (
    <section className="card min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-sm font-bold text-steel-50">
          {title}
          {count !== undefined && <span className="ml-2 rounded-full bg-line/[0.08] px-1.5 text-xs tabular-nums text-steel-400">{count}</span>}
        </span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 text-steel-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      {open && <div className="border-t border-line/[0.06] px-5 py-4">{children}</div>}
    </section>
  );
}

export default function EnquiryContactPanel({ enquiry, isOwner, canWrite, onSent, refreshKey }) {
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState({ subject: '', body: '' });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [sentNote, setSentNote] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showConversation, setShowConversation] = useState(false);

  const load = useCallback(async () => {
    const [entries, messages] = await Promise.all([
      enquiriesApi.timeline(enquiry._id).catch(() => []),
      isOwner ? enquiriesApi.messages(enquiry._id).catch(() => null) : Promise.resolve(null),
    ]);
    setTimeline(entries || []);
    setConversation(messages?.meta?.mayRead ? messages.data : null);
  }, [enquiry._id, isOwner]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const send = async (channel) => {
    setBusy(channel);
    setError(null);
    setSentNote(null);
    try {
      await enquiriesApi.sendMessage(
        channel === 'whatsapp'
          ? { id: enquiry._id, channel, body: whatsapp.trim() }
          : { id: enquiry._id, channel, subject: email.subject.trim(), body: email.body.trim() }
      );
      if (channel === 'whatsapp') setWhatsapp('');
      else setEmail({ subject: '', body: '' });
      setSentNote(channel === 'whatsapp' ? 'WhatsApp sent and recorded.' : 'Email sent and recorded.');
      await load();
      onSent?.();
    } catch (sendError) {
      setError(sendError);
    } finally {
      setBusy(null);
    }
  };

  const mayMessage = isOwner && canWrite;

  return (
    <div className="space-y-4">
      <Card title="Current Marketing Status">
        <MarketingStatusSelect enquiry={enquiry} canWrite={canWrite} onChanged={() => onSent?.()} />
      </Card>

      {mayMessage ? (
        <>
          <Card title="WhatsApp">
            <div className="rounded-xl border border-line/[0.08] bg-line/[0.03] p-3">
              <textarea
                rows={3}
                className="input"
                placeholder="Type a message to this customer…"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
              />
              <p className="mt-2 text-xs text-steel-500">Only the assigned user can see the conversation. Admin sees CRM activity only.</p>
              <button
                type="button"
                className="btn-primary mt-3"
                disabled={busy !== null || !whatsapp.trim()}
                onClick={() => send('whatsapp')}
              >
                {busy === 'whatsapp' ? 'Sending…' : 'Send from company WhatsApp'}
              </button>
            </div>
          </Card>

          <Card title="Email">
            <div className="space-y-2 rounded-xl border border-line/[0.08] bg-line/[0.03] p-3">
              <input
                className="input"
                placeholder="Email subject"
                value={email.subject}
                onChange={(event) => setEmail({ ...email, subject: event.target.value })}
              />
              <textarea
                rows={3}
                className="input"
                placeholder="Type customer email…"
                value={email.body}
                onChange={(event) => setEmail({ ...email, body: event.target.value })}
              />
              <p className="text-xs text-steel-500">Sending from your connected company email.</p>
              <button
                type="button"
                className="btn-primary"
                disabled={busy !== null || !email.subject.trim() || !email.body.trim()}
                onClick={() => send('email')}
              >
                {busy === 'email' ? 'Sending…' : 'Send Email & Record Activity'}
              </button>
            </div>
          </Card>

          {(error || sentNote) && (
            <div>
              <FormError error={error} />
              {sentNote && <p className="rounded-lg bg-success-500/10 px-3 py-2 text-sm text-success-400">{sentNote}</p>}
            </div>
          )}

          <Fold
            title="Conversation"
            count={conversation?.length ?? 0}
            open={showConversation}
            onToggle={() => setShowConversation((value) => !value)}
          >
            {conversation?.length ? (
              <ol className="space-y-2.5">
                {conversation.map((message) => (
                  <li
                    key={message._id}
                    className={`rounded-xl px-3 py-2 text-sm ${message.direction === 'in' ? 'mr-6 bg-line/[0.05]' : 'ml-6 bg-flame-500/10'}`}
                  >
                    {message.subject && <p className="font-semibold text-steel-100">{message.subject}</p>}
                    <p className="whitespace-pre-line text-steel-200">{message.body}</p>
                    <p className="mt-1 text-[0.7rem] text-steel-500">
                      {message.direction === 'in' ? 'Buyer' : message.automatic ? 'Sent automatically' : message.by || 'You'}
                      {' · '}{message.channel === 'email' ? 'Email' : 'WhatsApp'}
                      {' · '}{formatWhen(message.at)}
                      {message.status === 'failed' && <span className="text-danger-400"> · not delivered</span>}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-steel-500">Nothing sent or received on this enquiry yet.</p>
            )}
          </Fold>
        </>
      ) : (
        <Card title="Messages to the buyer">
          <p className="text-sm text-steel-400">
            Only {enquiry.assignedTo?.name || 'the assigned marketing person'} writes to the buyer from here.
            You see on the timeline that a message went, not what it said.
          </p>
        </Card>
      )}

      <Fold
        title="Activity timeline"
        count={timeline?.length ?? 0}
        open={showTimeline}
        onToggle={() => setShowTimeline((value) => !value)}
      >
        {timeline?.length ? (
          <ol className="relative space-y-4 border-l-2 border-line/[0.1] pl-4">
            {timeline.map((entry, index) => {
              const { title, detail } = describeEntry(entry);
              return (
                <li key={`${entry.kind}-${entry.at}-${index}`} className="relative">
                  <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-flame-500 ring-4 ring-ink-850" />
                  <p className="text-sm font-semibold text-steel-100">{title}</p>
                  {detail && <p className="mt-0.5 whitespace-pre-line text-sm text-steel-400">{detail}</p>}
                  <p className="mt-0.5 text-xs text-steel-500">
                    {formatWhen(entry.at)}
                    {entry.by && ` · ${entry.by}`}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-steel-500">Nothing recorded yet.</p>
        )}
      </Fold>
    </div>
  );
}
