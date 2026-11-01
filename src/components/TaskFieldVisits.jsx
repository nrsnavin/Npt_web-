import { useEffect, useState } from 'react';
import { field } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import NeedsVisitButton, { FIELD_TASK_KINDS } from './FieldVisitButton.jsx';
import FieldVisitList from './FieldVisitList.jsx';

/**
 * The field visits planned on a task [server: fieldVisit.service `visitsOfTask`], on its panel:
 * each with who, which day, how it went — and Needs visit for whoever may plan one, or Check in
 * for the person it is planned for.
 */

export default function TaskFieldVisits({ todo }) {
  const { user } = useAuth();
  const [visits, setVisits] = useState(null);
  const taskId = todo?._id;
  useEffect(() => {
    if (!taskId || !FIELD_TASK_KINDS.includes(todo?.kind)) return undefined;
    let live = true;
    field.ofTask(taskId).then((rows) => { if (live) setVisits(rows); }).catch(() => { if (live) setVisits([]); });
    return () => { live = false; };
  }, [taskId, todo?.kind]);
  if (!FIELD_TASK_KINDS.includes(todo?.kind) || !visits) return null;
  const open = visits.find((visit) => ['planned', 'checked_in'].includes(visit.status));
  const marks = user?.fieldVisit || {};
  const mayPlan = marks.mayAssign || marks.maySelfPlan || user?.role === 'admin';
  if (!visits.length && !mayPlan) return null;
  return (
    <div className="rounded-xl border border-line/[0.08] p-3" aria-label="Field visits">
      <p className="mb-1.5 text-xs font-semibold text-steel-400">Field visits</p>
      <FieldVisitList visits={visits} className="mb-2" />
      {!todo.completed && (
        <NeedsVisitButton
          taskId={taskId}
          fieldVisit={open ? { _id: open._id, status: open.status, user: open.user, date: open.plannedDate, time: open.plannedTime } : null}
        />
      )}
    </div>
  );
}
