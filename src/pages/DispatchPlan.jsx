import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui.jsx';
import TripPlanner from '../components/TripPlanner.jsx';

/** Plan trips — the dispatch requests that can go, in groups that can go together. */
export default function DispatchPlan() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan trips"
        subtitle="Ready dispatch requests, grouped by transporter, route and place. Tick who goes and press Make trip."
        actions={<Link to="/dispatch/lists" className="btn-secondary">Vehicles &amp; transporters</Link>}
      />
      <TripPlanner />
    </div>
  );
}
