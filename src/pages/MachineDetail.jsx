import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { machinesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Badge, ErrorState, Facts, Notice, PageHeader, Section, Spinner } from '../components/ui.jsx';
import MaintenanceForm from '../components/MaintenanceForm.jsx';
import { MaintenanceTable, RunsTable } from '../components/RecordTables.jsx';
import { MachineEditor } from './Machines.jsx';
import { formatDate } from '../utils/format.js';
import { MACHINE_STATUSES, labelOf, toneOf } from '../utils/records.js';

/**
 * One machine [server: records.controller `machineDetail`]: what it is, when it was last serviced
 * and is next due, every piece of maintenance done on it — and on moulds while they were on it —
 * and the runs made on it.
 */
export default function MachineDetail() {
  const { id } = useParams();
  const { canWrite, mayPlanProduction } = useAuth();
  const fetch = useCallback((machineId) => machinesApi.get(machineId), []);
  const { data, loading, error, reload } = useRecord(fetch, id);
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState(false);

  if (loading) return <Spinner label="Loading the machine" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const { machine, maintenance, runs } = data;
  const mayRecord = canWrite('production') || canWrite('moulds');
  const downtime = maintenance.filter((row) => row.asset === 'machine').reduce((sum, row) => sum + (row.downtimeHours || 0), 0);
  const spent = maintenance.filter((row) => row.asset === 'machine').reduce((sum, row) => sum + (row.totalCost || 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={machine.code}
        subtitle={[machine.name, machine.make, machine.tonnage && `${machine.tonnage}T`].filter(Boolean).join(' · ')}
        actions={(
          <>
            <Link to="/machines" className="btn-secondary">All machines</Link>
            {canWrite('production') && mayPlanProduction && <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>}
            {mayRecord && <button type="button" className="btn-primary" onClick={() => setRecording(true)}>Record maintenance</button>}
            <Badge tone={toneOf(MACHINE_STATUSES, machine.status)}>{labelOf(MACHINE_STATUSES, machine.status)}</Badge>
          </>
        )}
      />
      {machine.serviceOverdue && <Notice tone="warn">Service was due on {formatDate(machine.nextServiceDue)}.</Notice>}

      <Section title="The machine">
        <Facts
          items={[
            { label: 'Last service', value: machine.lastServiceAt ? formatDate(machine.lastServiceAt) : 'Not recorded' },
            { label: 'Next due', value: machine.nextServiceDue ? formatDate(machine.nextServiceDue) : null },
            { label: 'Service every', value: machine.serviceEveryDays ? `${machine.serviceEveryDays} days` : null },
            { label: 'Shot capacity', value: machine.shotCapacityGrams ? `${machine.shotCapacityGrams} g` : null },
            { label: 'Where it is', value: machine.location },
            { label: 'Year', value: machine.year },
            { label: 'Down for repairs (recorded)', value: downtime ? `${Math.round(downtime * 10) / 10} hours` : null },
            { label: 'Spent on it (recorded)', value: spent ? `₹${spent.toLocaleString('en-IN')}` : null },
            { label: 'Notes', value: machine.notes, wide: true },
          ]}
        />
      </Section>

      <Section title={`Maintenance history (${maintenance.length})`}>
        <MaintenanceTable rows={maintenance} showAsset empty="No maintenance recorded on this machine yet." />
      </Section>

      <Section title={`Runs on this machine (${runs.length})`}>
        <RunsTable rows={runs} showMould empty="No runs recorded on this machine yet." />
      </Section>

      <MaintenanceForm open={recording} asset="machine" machine={machine} onClose={() => setRecording(false)} onSaved={reload} />
      {editing && <MachineEditor machine={machine} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  );
}
