import { Notice } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * The decisions somebody took against a warning, on the consignment they were taken on
 * [BLUEPRINT §15, §19].
 *
 * Three of despatch's gates warn rather than refuse: sending a load quality has not cleared,
 * closing one with no proof of delivery, and sending one with no delivery address. Each is the
 * right choice — a hard gate on a soft judgement gets worked around outside the system, where
 * nobody can see it — and each is only safe because of what is recorded: the reason, the name,
 * and the day.
 *
 * **That record is worth nothing if it is not on the screen.** A warning nobody can be asked
 * about is decoration, and the whole argument for allowing the exception is that somebody can
 * be asked. So it is drawn in both places a person arrives from: the consignment's own page,
 * which is what somebody opens once they have been asked, and the order tracker, which is where
 * it gets noticed in the first place.
 *
 * One component and one table, rather than a block per override per screen. The two screens had
 * a near-identical pair each, and the third override would have made six copies of the same six
 * lines — which is how a field ends up displayed on one screen and silently not on the other.
 * Same argument as `answerable.js`, which holds the asking half of these three.
 */
const OVERRIDES = [
  {
    field: 'qualityOverride',
    tone: 'danger',
    title: 'Sent past a quality warning',
    /* What the screen said at the time, which the inspection may have superseded since — and
       the question this answers is what was known when the lorry left. */
    extra: (record) => (record.concern ? `The concern at the time: ${record.concern}` : null),
  },
  {
    field: 'closedWithoutPod',
    tone: 'warn',
    title: 'Closed with no proof of delivery',
  },
  {
    field: 'addressOverride',
    tone: 'warn',
    title: 'Sent with no delivery address',
  },
];

export default function OverrideNotices({ dispatch, className = '' }) {
  const taken = OVERRIDES.map((entry) => ({ entry, record: dispatch?.[entry.field] })).filter(
    ({ record }) => record?.reason
  );

  if (!taken.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {taken.map(({ entry, record }) => {
        const extra = entry.extra?.(record);

        return (
          <Notice key={entry.field} tone={entry.tone}>
            <p>
              <span className="font-bold">{entry.title}</span>
              {record.by?.name ? ` by ${record.by.name}` : ''}
              {record.at ? ` on ${formatDate(record.at)}` : ''}: {record.reason}
            </p>
            {extra && <p className="mt-1 text-xs">{extra}</p>}
          </Notice>
        );
      })}
    </div>
  );
}
