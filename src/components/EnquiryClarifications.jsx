import { Section } from './ui.jsx';
import { formatDateTime } from '../utils/format.js';

/**
 * The questions a department asked marketing on this enquiry's tasks — the SO team's Needs
 * Clarification — and marketing's answers, kept with the enquiry for good
 * [server: handoff.service `answerParent`]. Newest first.
 */
export default function EnquiryClarifications({ clarifications }) {
  const list = [...(clarifications || [])].filter((pair) => pair.answer).reverse();
  if (!list.length) return null;
  return (
    <Section title={`Questions answered (${list.length})`}>
      <ul className="divide-y divide-line/[0.06]">
        {list.map((pair, at) => (
          <li key={at} className="space-y-1 py-2.5 first:pt-0 last:pb-0">
            <p className="text-sm text-steel-300">
              <span className="font-semibold text-steel-100">{pair.department === 'order_confirmation' ? 'SO team asked' : 'Asked'}:</span> {pair.question || '—'}
              <span className="text-xs text-steel-500">{pair.askedBy?.name ? ` · ${pair.askedBy.name}` : ''}{pair.askedAt ? ` · ${formatDateTime(pair.askedAt)}` : ''}</span>
            </p>
            <p className="text-sm text-steel-100">
              <span className="font-semibold text-success-400">Answer:</span> {pair.answer}
              <span className="text-xs text-steel-500">{pair.answeredBy?.name ? ` · ${pair.answeredBy.name}` : ''}{pair.answeredAt ? ` · ${formatDateTime(pair.answeredAt)}` : ''}</span>
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
