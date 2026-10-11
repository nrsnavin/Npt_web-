import DepartmentTasksBoard from '../components/DepartmentTasksBoard.jsx';

/**
 * Department Tasks on the bar: the open requests this person follows, on a screen of their own
 * [components/DepartmentTasksBoard.jsx]. The same board sits on the overview dashboard.
 */
export default function DepartmentTasks() {
  return (
    <div className="mx-auto max-w-7xl">
      <DepartmentTasksBoard />
    </div>
  );
}
