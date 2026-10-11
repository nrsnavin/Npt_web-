import { useSearchParams } from 'react-router-dom';
import DepartmentTasksBoard from '../components/DepartmentTasksBoard.jsx';

/**
 * Department Tasks on the bar: the requests this person follows, on a screen of their own
 * [components/DepartmentTasksBoard.jsx]. The same board sits on the overview dashboard.
 *
 * The filters live in the address — `/tasks?department=production&state=done` — so Admin can
 * bookmark one department's tasks, or be sent straight to them.
 */
export default function DepartmentTasks() {
  const [params, setParams] = useSearchParams();
  const department = params.get('department') || '';
  const state = params.get('state') || 'open';
  const onFilter = (next) => {
    const query = {};
    if (next.department) query.department = next.department;
    if (next.state && next.state !== 'open') query.state = next.state;
    setParams(query, { replace: true });
  };
  return (
    <div className="mx-auto max-w-7xl">
      <DepartmentTasksBoard headingAs="h1" department={department} state={state} onFilter={onFilter} />
    </div>
  );
}
