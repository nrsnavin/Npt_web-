/**
 * The rule for sending a quotation, said before anything is sent — the server holds the same one
 * (services/quotationMessage.js `sendProblem`).
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (value) => String(value || '').replace(/\D/g, '');

/** Why these recipients and texts cannot be sent, or null. */
export function sendProblem({ email, whatsapp }) {
  if (!email?.send && !whatsapp?.send) return 'Choose email, WhatsApp, or both.';
  if (email?.send) {
    if (!EMAIL.test(String(email.to || '').trim())) return 'Give an email address to send it to.';
    if (!String(email.subject || '').trim()) return 'The email needs a subject.';
    if (!String(email.body || '').trim()) return 'The email needs a message.';
  }
  if (whatsapp?.send) {
    const n = digits(whatsapp.to).length;
    if (n < 8 || n > 15) return 'Give a WhatsApp number to send it to.';
    if (!String(whatsapp.body || '').trim()) return 'The WhatsApp message is empty.';
  }
  return null;
}

/** "Send by email and WhatsApp" — what the button does, in its own words. */
export function sendLabel({ email, whatsapp }) {
  const ways = [email?.send && 'email', whatsapp?.send && 'WhatsApp'].filter(Boolean);
  return ways.length ? `Send by ${ways.join(' and ')}` : 'Send';
}

const REASONS = {
  opted_out: 'the customer has asked not to be messaged this way',
  no_provider: 'not set up on the server',
  no_address: 'no address',
  already_sent: 'already sent',
};

/**
 * What happened on each channel, one line each — "Emailed to senthil@smg.in", "WhatsApp to
 * +919840011223 failed: …". A send can reach the buyer one way and not the other, and the
 * sender needs to know which.
 */
export function deliveryLines(deliveries = []) {
  return deliveries.map((row) => {
    const way = row.channel === 'email' ? 'Email' : 'WhatsApp';
    /* A server with no mail or WhatsApp provider (development only) writes the message to its
       log instead — recorded as sent, but nobody received it, and the sender should know. */
    if (row.status === 'sent' && row.providerStatus === 'logged') return { ok: false, text: `${way} to ${row.recipient} only written to the server log — no provider is set up` };
    if (row.status === 'sent') return { ok: true, text: `${way} sent to ${row.recipient}` };
    if (row.status === 'skipped') return { ok: false, text: `${way} to ${row.recipient} not sent — ${REASONS[row.skipReason] || row.skipReason}` };
    return { ok: false, text: `${way} to ${row.recipient} failed${row.error ? `: ${row.error}` : ''}` };
  });
}
