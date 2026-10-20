/**
 * Delivery urgency on a Dispatch request [server: config/deliveryUrgency.js] — the order of the
 * Dispatch desk's delivery queue. Today Morning is late after noon; Today Evening, Today and
 * Tomorrow (the next day) after 7 PM; Top Most Urgent is first whatever the clock.
 */
export const DELIVERY_URGENCIES = [
  { key: 'top_urgent', label: 'Top Most Urgent', hint: 'The truck is at the gate — first, whatever the time' },
  { key: 'today_morning', label: 'Today Morning', hint: 'Gone by 12 noon today' },
  { key: 'today_evening', label: 'Today Evening', hint: 'Gone by 7 PM today, in the evening run' },
  { key: 'today', label: 'Today', hint: 'Any time today, by 7 PM' },
  { key: 'tomorrow', label: 'Tomorrow', hint: 'Gone by 7 PM tomorrow' },
];

/** The chip's colour by urgency: red when late or Top Most Urgent, amber for today, quiet for tomorrow. */
export function urgencyTone(delivery) {
  if (!delivery) return 'bg-line/[0.06] text-steel-400';
  if (delivery.late || delivery.urgency === 'top_urgent') return 'bg-danger-500/15 text-danger-400';
  if (delivery.urgency === 'tomorrow') return 'bg-line/[0.08] text-steel-200';
  return 'bg-warn-500/15 text-warn-400';
}

/** "by 12 noon today", "by 7 PM tomorrow", "late — was due 12 noon today", in India time. */
export function dueWords(delivery, now = new Date()) {
  if (!delivery) return 'Urgency not given yet';
  if (!delivery.dueBy) return 'First, whatever the time';
  const due = new Date(delivery.dueBy);
  const day = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(due));
  const clock = hour === 12 ? '12 noon' : `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? 'PM' : 'AM'}`;
  const tomorrow = day(new Date(now.getTime() + 86400000));
  const when = day(due) === day(now) ? 'today' : day(due) === tomorrow ? 'tomorrow'
    : new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(due);
  return delivery.late ? `Late — was due ${clock} ${when}` : `By ${clock} ${when}`;
}
