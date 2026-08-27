import { useCallback } from 'react';
import { leads as leadsApi } from '../api/endpoints.js';
import { useRecord } from '../hooks/useRecords.js';
import { Section } from './ui.jsx';
import { formatCompactCurrency } from '../utils/format.js';

/**
 * The marketing scoreboard.
 *
 * Gamification has one failure mode and it is not subtle: **whatever you put on the board,
 * you get more of.** A leaderboard topped by contacts logged teaches people to log contacts —
 * "called, no answer" ten times on a Friday afternoon — and the register that was the honest
 * record of a relationship becomes a thing they farm. The board looks healthier while the
 * data gets worse, which is the worst combination available.
 *
 * So nothing here is scored on activity. The streak counts *days something moved*, not
 * entries, so a tenth call today does nothing for it. Promises kept counts follow-ups
 * honoured, which gets worse if you set dates you then miss. Conversions and wins need a real
 * buyer to agree.
 *
 * Contacts logged is shown, in grey, with no rank attached — it is genuinely useful context
 * and leaving it out to make a point would be its own kind of dishonesty.
 */

const flame = (days) => {
  if (days >= 20) return '🔥🔥🔥';
  if (days >= 10) return '🔥🔥';
  if (days >= 3) return '🔥';
  return '';
};

function Figure({ label, value, hint, big = false, muted = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-steel-500">{label}</p>
      <p
        className={`mt-0.5 font-bold tabular-nums ${big ? 'text-2xl' : 'text-lg'} ${
          muted ? 'text-steel-400' : 'text-steel-100'
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[0.6875rem] leading-tight text-steel-500">{hint}</p>}
    </div>
  );
}

export default function Scoreboard() {
  const fetch = useCallback(() => leadsApi.scoreboard(), []);
  const { data, error } = useRecord(fetch, 'scoreboard');

  // A scoreboard that cannot load is not worth an error state on somebody's dashboard.
  if (error || !data?.mine) return null;

  const { mine, team } = data;

  return (
    <Section title="Your month">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Streak"
          value={`${mine.streakDays}d ${flame(mine.streakDays)}`.trim()}
          // Said out loud, because a streak whose rule is unclear is one people game rather
          // than keep.
          hint="Days running something moved"
          big
        />
        <Figure
          label="Converted"
          value={mine.convertedThisMonth}
          hint="Leads that became customers"
          big
        />
        <Figure
          label="Won"
          value={mine.wonThisMonth}
          hint={mine.wonValueThisMonth ? formatCompactCurrency(mine.wonValueThisMonth) : 'enquiries'}
          big
        />
        <Figure
          label="Promises kept"
          value={mine.promisesKeptPercent == null ? '—' : `${mine.promisesKeptPercent}%`}
          hint="Follow-ups honoured on time"
          big
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line/[0.06] pt-3">
        <Figure label="Open leads" value={mine.openLeads} muted />
        <Figure label="Qualified or converted" value={mine.movedForward} muted />
        {/* Shown, never ranked. See the note at the top of this file. */}
        <Figure label="Contacts logged" value={mine.contactsThisMonth} muted hint="context, not a score" />
      </div>

      {Boolean(team?.length) && (
        <div className="mt-5 border-t border-line/[0.06] pt-4">
          <p className="eyebrow mb-3">The team this month</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Who</th>
                  <th className="px-3 py-2 text-right">Streak</th>
                  <th className="px-3 py-2 text-right">Converted</th>
                  <th className="px-3 py-2 text-right">Won</th>
                  <th className="px-3 py-2 text-right">Kept</th>
                  <th className="px-3 py-2 text-right text-steel-500">Contacts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/[0.04]">
                {team.map((row, index) => (
                  <tr key={row.user._id} className="row-hover">
                    <td className="px-3 py-2.5">
                      <span className="mr-2 text-xs tabular-nums text-steel-500">{index + 1}</span>
                      <span className="font-semibold text-steel-100">{row.user.name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-steel-200">
                      {row.streakDays}d {flame(row.streakDays)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-steel-100">
                      {row.convertedThisMonth}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-steel-200">{row.wonThisMonth}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-steel-200">
                      {row.promisesKeptPercent == null ? '—' : `${row.promisesKeptPercent}%`}
                    </td>
                    {/* Greyed on purpose: present because it is useful, unranked because
                        ranking it is the one change that would make the data worse. */}
                    <td className="px-3 py-2.5 text-right tabular-nums text-steel-500">
                      {row.contactsThisMonth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-steel-500">
            Ranked on conversions, then wins, then the streak. Contacts logged is shown because
            it is worth knowing and left unranked because whatever a board ranks is what people
            do more of — and more contacts logged is not the same thing as more selling.
          </p>
        </div>
      )}
    </Section>
  );
}
