import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ProductionQueueList from '../components/ProductionQueueList.jsx';
import { PageHeader } from '../components/ui.jsx';
import { todayInIndia } from '../utils/taskForm.js';
import { queueCsv } from '../utils/productionQueue.js';

/**
 * The production queue [server: productionQueue.controller]: every enquiry on the press in the
 * order the goods are due, each on one line — its EDD, whose it is, its state in at most thirty
 * words and its work orders. Read by every department; worked on each enquiry's Production
 * workflow page [pages/ProductionWorkflow.jsx], where the statuses, the hand-overs to Printing
 * and Assembly, and the EDD are given model by model.
 */
export default function ProductionQueue() {
  const { isAdmin, departments = [], canWrite } = useAuth();
  const [rows, setRows] = useState([]);
  const onRows = useCallback((next) => setRows(next), []);
  const worksProduction = isAdmin || departments.includes('production') || canWrite('production');

  /* The queue as a sheet, for the floor's own board or a supplier's WhatsApp. */
  const download = () => {
    const blob = new Blob([queueCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `production-queue-${todayInIndia()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Production queue"
        subtitle="In the order the goods are due — open an enquiry’s workflow to update it"
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {worksProduction && <Link to="/work-orders" className="btn-secondary">Work orders</Link>}
            {worksProduction && <Link to="/production/plan" className="btn-secondary">Planning board</Link>}
            <button type="button" className="btn-secondary" onClick={() => window.print()}>Print</button>
            <button type="button" className="btn-secondary" onClick={download} disabled={!rows.length}>CSV</button>
          </div>
        }
      />
      <ProductionQueueList onRows={onRows} />
    </div>
  );
}
