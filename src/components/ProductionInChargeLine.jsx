import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspace } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Who plans Production's work [server: productionInCharge.service]: a line naming the Production
 * in charge on the Production desks — or, when nobody is marked, a warning that only Admin can
 * give the EDD and decide printing / assembly until someone is ticked in Masters & Access.
 */
export default function ProductionInChargeLine({ className = '' }) {
  const { isAdmin } = useAuth();
  const [people, setPeople] = useState(null);
  useEffect(() => {
    let live = true;
    workspace.productionInCharge().then((list) => { if (live) setPeople(list || []); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!people) return null;
  if (!people.length) {
    return (
      <p className={`rounded-lg border border-warn-500/40 bg-warn-500/[0.07] px-3 py-2 text-sm text-steel-100 ${className}`} role="status">
        <span className="font-bold text-warn-400">Nobody is Production in charge.</span>{' '}
        Only Admin can give the EDD and decide printing / assembly until someone is ticked.
        {isAdmin && <> <Link to="/users" className="font-semibold text-accent hover:underline">Mark someone in Masters &amp; Access →</Link></>}
      </p>
    );
  }
  return (
    <p className={`text-xs text-steel-400 ${className}`}>
      Production in charge: <span className="font-semibold text-steel-200">{people.map((person) => person.name).join(', ')}</span>
      {' '}— gives the EDD and decides printing / assembly.
    </p>
  );
}
