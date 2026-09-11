const listeners = new Set();
let sequence = 0;
const pending = new Map();
const nouns = { components: 'Component', customers: 'Customer', leads: 'Lead', enquiries: 'Enquiry', samples: 'Sample', orders: 'Order', dispatches: 'Dispatch', payments: 'Payment', pricings: 'Costing', quotations: 'Quotation', production: 'Production', quality: 'Quality check', users: 'User', moulds: 'Model', materials: 'Material', hooks: 'Hook', clips: 'Clip', prints: 'Print', todos: 'Task', notes: 'Note', announcements: 'Announcement', escalations: 'Escalation', queries: 'Query', profile: 'Profile' };
export function actionLabel(config) {
  const parts = String(config.url || '').split(/[/?]/).filter(Boolean);
  const noun = nouns[parts[0] === 'workspace' ? parts[1] : parts[0]] || 'Record';
  const last = parts.at(-1);
  if (parts[0] === 'auth') return ({login:'Signed in',register:'Account created',me:'Profile updated','change-password':'Password changed',request:'Verification code requested',verify:'Signed in',confirm:'Contact verified'})[last] || 'Account updated';
  if (parts[0] === 'jarvis') return 'Answer ready';
  if (config.method === 'delete' && parts.includes('comments')) return 'Comment removed';
  if (config.method === 'delete' && parts.includes('logs')) return 'Log entry removed';
  if (config.method === 'delete' && parts.includes('documents')) return 'Document removed';
  if (config.method === 'delete' && last === 'reference-photo') return 'Reference photo removed';
  const labels = { activities:'Activity recorded', suggest:'Suggestions ready', group:'Enquiries created', 'promote-mould':'Model created', checks:'Order check updated', priority:'Order priority updated', order:'Order created', inspections:'Inspection recorded', 'follow-ups':'Follow-up recorded', judgement:'Payment follow-up status updated', advance:'Advance requested', production:'Production updated', queries:'Query raised', answers:'Answer recorded', close:'Query closed', escalations:'Escalation raised', updates:'Escalation update recorded', resolve:'Escalation resolved', cost:'Costing saved', decision:'Costing decision recorded', quotation:'Quotation created', revisions:'Quotation revised', send:'Quotation sending recorded', response:'Customer response recorded', assign:'Sample assigned', feedback:'Sample feedback recorded', resample:'New sample requested', 'link-enquiry':'Enquiry linked', 'link-customer':'Customer linked', 'customer-message':'Customer message recorded', logs:'Log entry added', comments:'Comment added', 'reference-photo':'Reference photo uploaded', sync:'Sync completed', documents:'Document uploaded', reassign:'Selected records reassigned', access:'Access updated', reset:'Department access restored' };
  if (labels[last]) return labels[last];
  if (last === 'receipts') return 'Receipt recorded';
  if (last === 'read') return 'Announcement marked as read';
  if (last === 'convert') return `${noun} converted`;
  if (last === 'pod' || last === 'photo' || last === 'po') return 'Document uploaded';
  if (config.method === 'delete') return noun === 'User' ? 'User offboarded' : `${noun} removed`;
  if (config.method === 'post' && parts.length === (parts[0] === 'workspace' ? 2 : 1)) return `${noun} created`;
  return `${noun} updated`;
}
const emit = (event) => listeners.forEach((listener) => listener({ ...event, pending: pending.size }));
export function subscribeFeedback(listener) { listeners.add(listener); listener({ pending: pending.size }); return () => listeners.delete(listener); }
export function beginFeedback(config) {
  if (!['post', 'put', 'patch', 'delete'].includes(config.method) || config.feedback === false) return;
  config.feedbackId = ++sequence;
  pending.set(config.feedbackId, true);
  emit({});
}
export function finishFeedback(config, response, error) {
  if (!config?.feedbackId || !pending.delete(config.feedbackId)) return;
  emit({ message: error ? 'Action could not be completed' : response.status === 202 ? 'Saved — completion pending' : actionLabel(config),
    detail: error?.message || (response.status === 202 ? response.data?.message || 'The app will retry the remaining steps. Refresh to check progress.' : [response.data?.data?.number, response.data?.data?.status?.replaceAll('_', ' ')].filter(Boolean).join(' · ') || undefined),
    tone: error ? 'danger' : response.status === 202 ? 'info' : 'success' });
}
