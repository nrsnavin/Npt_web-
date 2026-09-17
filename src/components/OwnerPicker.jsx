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

  /* Nobody on the team at all: an administrator has not finished setting the plant up. Said
     here, because the alternative is a required field that can never be filled. */
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
      <Field label={label} error={error} className="sm:col-span-2">
        <select
          className="input"
          disabled={!team}
          {...register('assignedTo', { required: 'Choose who will own this' })}
        >
          {/* Empty, and stays empty until somebody picks. The point is the question. */}
          <option value="">{team ? 'Choose somebody in marketing…' : 'Loading the team…'}</option>
          {(team || []).map((person) => (
            <option key={person._id} value={person._id}>
              {person.name}
              {String(person._id) === me ? ' (you)' : ''}
            </option>
          ))}
        </select>
      </Field>

      {handingOver && (
        <p className="text-xs leading-relaxed text-steel-400 sm:col-span-2">
          This will be theirs to chase. You will not see it on your own list afterwards.
        </p>
      )}
    </>
  );
}
