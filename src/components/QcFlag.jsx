import { useState } from 'react';
import { Link } from 'react-router-dom';
import { askCustomerLocation } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * The latest QC verdict on a stop's goods [server: records.service `latestQcByEnquiry`], beside the
 * stop on the plan, the trip and the SO. A warning, never a lock: a rejected lot shows red and the
 * stop can still be loaded — the plant decides, knowing.
 */
const LOOK = {
  rejected: { label: 'QC rejected', className: 'bg-danger-500/15 text-danger-400' },
  on_hold: { label: 'QC on hold', className: 'bg-warn-500/15 text-warn-400' },
  passed_with_deviation: { label: 'QC passed with deviation', className: 'bg-warn-500/15 text-warn-400' },
  passed: { label: 'QC passed', className: 'bg-success-500/15 text-success-400' },
};

export default function QcFlag({ qc }) {
  const { canRead } = useAuth();
  if (!qc) return null;
  const look = LOOK[qc.verdict] || LOOK.passed;
  const words = `${look.label} · ${qc.number}${qc.failed?.length ? ` — ${qc.failed.join(', ')}` : ''}`;
  const chip = <span className={`inline-block rounded-full px-2 text-xs font-semibold leading-5 ${look.className}`} title={words}>{look.label}{qc.failed?.length ? ` — ${qc.failed.join(', ')}` : ''}</span>;
  return canRead('quality') ? <Link to={`/qc-records/${qc._id}`} aria-label={words}>{chip}</Link> : chip;
}

/**
 * Asks the buyer on WhatsApp to share their delivery location; the next location they send is
 * pinned on them [server: services/customerLocation.service.js].
 */
export function AskLocation({ customerId, className = '' }) {
  const [state, setState] = useState('idle');
  const [problem, setProblem] = useState('');
  if (!customerId) return null;
  const ask = async () => {
    setState('busy');
    setProblem('');
    try { await askCustomerLocation(customerId); setState('asked'); } catch (failure) { setProblem(failure.message); setState('idle'); }
  };
  if (state === 'asked') return <span className={`text-xs text-success-400 ${className}`}>Asked on WhatsApp — the pin is set when they share it</span>;
  return (
    <span className={className}>
      <button type="button" className="text-xs font-semibold text-accent hover:underline" disabled={state === 'busy'} onClick={ask}>
        {state === 'busy' ? 'Asking…' : 'Ask for location on WhatsApp'}
      </button>
      {problem && <span className="ml-2 text-xs text-danger-400">{problem}</span>}
    </span>
  );
}
