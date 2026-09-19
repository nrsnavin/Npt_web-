import { useEffect, useState } from 'react';
import { Field, Notice } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { failureMessage } from '../api/failure.js';
import { isOwnershipScoped, selfId } from '../utils/pipeline.js';

/**
 * Who is going to chase this buyer — asked, not assumed.
 *
 * A lead and a customer each belong to one marketing person [§29], and that ownership is not a
 * label: it decides whose list the record appears on, who the follow-up reminder goes to, and
 * under §29 who can see it at all. It used to be filled in without anybody choosing — a new
 * customer went to whoever created it, a new lead went round-robin across marketing — so the
 * most consequential field on the form was the one nobody looked at.
 *
 * Two things follow from that, and both are on the screen rather than in a comment:
 *
 * **It starts empty.** A pre-selected name is a default, and a default is the thing being
 * replaced. An empty select that will not submit is the only version of this that actually asks.
 *
 * **It says what choosing a colleague costs.** Under §29 a marketing person who hands a record
 * to somebody else stops being able to see it — the save succeeds and the row is simply not on
 * their list afterwards. That is the correct behaviour and a horrible surprise, so the form says
 * it in advance, once a name other than their own is picked.
 */
export default function OwnerPicker({ register, error, watch, load, label = 'Who will own this' }) {
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    let live = true;
    load()
      .then((answer) => {
        if (live) setTeam(answer.data || []);
      })
      .catch((problem) => {
        if (live) setFailed(problem);
      });
    return () => {
      live = false;
    };
  }, [load]);

  const chosen = watch('assignedTo');
  /*
   * Only worth saying to somebody it is true for. An admin or a manager hands a record over and
   * still sees it on every list, so telling them they will lose sight of it would be a warning
   * about something that does not happen — and a form that cries wolf once gets read past.
   */
  /*
   * Through `selfId`, because the two sides spell the field differently: the API's own user
   * payload calls it `id` and a populated record calls it `_id`. Comparing against `user._id`
   * silently never matched, so the reader's own name went unmarked and this warning never fired
   * — a check that is always false looks exactly like a check that is always passing.
   */
  const me = selfId(user);
  const handingOver = isOwnershipScoped(user) && chosen && me && String(chosen) !== me;

  /*
   * The reader's own name, when the server offered it as a *different kind* of answer.
   *
   * An administrator or a manager may hold a buyer — the server has always accepted them — but
   * they are not on the marketing roster, so the list had no entry for them and the field is
   * required. The one person allowed to keep a buyer themselves was the one who could not say
   * so. The roster sends them back flagged, and the flag is why they are drawn apart rather
   * than slipped in among the marketing names: assigning a buyer to a colleague and keeping one
   * yourself are two decisions, and a list that mixes them makes the second look like the first.
   */
  const roster = team || [];
  const marketing = roster.filter((person) => !person.self);
  const yourself = roster.find((person) => person.self);
  const keepingIt = yourself && chosen && String(chosen) === String(yourself._id);

  /*
   * A roster that would not load is worth saying plainly. Without it the select is empty, and an
   * empty required dropdown with no explanation reads as a broken form rather than as a list
   * that did not arrive.
   */
  if (failed) {
    return (
      <Notice tone="warn">
        <p>Could not load the marketing team — {failureMessage(failed)}</p>
      </Notice>
    );
  }

  /*
   * Nobody at all — not even the reader. Said here, because the alternative is a required field
   * that can never be filled.
   *
   * An administrator reaching this screen on a plant with no marketing team no longer sees it:
   * they are offered themselves, which is the whole point. It is still the right message for a
   * marketing person whose own write access has been taken away.
   */
  if (team && !team.length) {
    return (
      <Notice tone="warn">
        <p>
          Nobody in marketing can hold a buyer yet, so there is no owner to choose. An
          administrator needs to give somebody in marketing write access to enquiries.
        </p>
      </Notice>
    );
  }

  return (
    <>
      <Field label={label} error={error} className="sm:col-span-2" required>
        <select
          className="input"
          disabled={!team}
          {...register('assignedTo', { required: 'Choose who will own this' })}
        >
          {/* Empty, and stays empty until somebody picks. The point is the question. */}
          <option value="">
            {!team ? 'Loading the team…' : yourself ? 'Choose an owner…' : 'Choose somebody in marketing…'}
          </option>

          {/* Grouped only when there is a second kind of answer to tell apart. A lone
              `<optgroup>` over the only list there is, is a heading for nothing. */}
          {yourself ? (
            <>
              {Boolean(marketing.length) && (
                <optgroup label="Marketing">
                  {marketing.map((person) => (
                    <option key={person._id} value={person._id}>{person.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Keep it yourself">
                <option value={yourself._id}>{yourself.name} (you)</option>
              </optgroup>
            </>
          ) : (
            marketing.map((person) => (
              <option key={person._id} value={person._id}>
                {person.name}
                {String(person._id) === me ? ' (you)' : ''}
              </option>
            ))
          )}
        </select>
      </Field>

      {handingOver && (
        <p className="text-xs leading-relaxed text-steel-400 sm:col-span-2">
          This will be theirs to chase. You will not see it on your own list afterwards.
        </p>
      )}

      {/*
        The consequence of the other answer, said as plainly as the hand-over above it.
        §3 and §29 assume a marketing person is chasing the relationship — the follow-up
        reminders, the scoreboard, the untouched-leads count all read from the owner. Keeping a
        buyer yourself is a legitimate thing to do and it takes them off all of that, which is
        worth knowing before pressing save rather than after wondering why nobody rang them.
      */}
      {keepingIt && (
        <p className="text-xs leading-relaxed text-steel-400 sm:col-span-2">
          Yours to chase, not marketing&rsquo;s. Nobody on the team will see it on their list or
          be reminded to follow it up.
        </p>
      )}
    </>
  );
}
