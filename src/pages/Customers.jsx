import CrudPage from '../components/CrudPage.jsx';
import { customers } from '../api/endpoints.js';
import { Badge } from '../components/ui.jsx';
import { formatCompactCurrency, humanise } from '../utils/format.js';

const SEGMENTS = ['retail_chain', 'garment_exporter', 'distributor', 'boutique', 'oem', 'other'];
const STATUSES = ['active', 'on_hold', 'inactive'];

export default function Customers() {
  return (
    <CrudPage
      title="Customers"
      subtitle="Retail chains, exporters and distributors buying hangers"
      resourceKey="customers"
      resource={customers}
      entityName="customer"
      writeRoles={['sales', 'accounts']}
      searchPlaceholder="Search name, code, GSTIN…"
      defaultParams={{ sort: 'name' }}
      filters={[
        {
          key: 'segment',
          label: 'All segments',
          options: SEGMENTS.map((segment) => ({ value: segment, label: humanise(segment) })),
        },
        {
          key: 'status',
          label: 'All statuses',
          options: STATUSES.map((status) => ({ value: status, label: humanise(status) })),
        },
      ]}
      columns={[
        {
          key: 'name',
          header: 'Customer',
          render: (row) => (
            <div>
              <p className="font-medium text-steel-50">{row.name}</p>
              <p className="text-xs text-steel-500">{row.code}</p>
            </div>
          ),
        },
        { key: 'segment', header: 'Segment', render: (row) => humanise(row.segment) },
        {
          key: 'contact',
          header: 'Contact',
          render: (row) => (
            <div className="text-xs">
              <p>{row.email || '—'}</p>
              <p className="text-steel-500">{row.phone || '—'}</p>
            </div>
          ),
        },
        { key: 'gstin', header: 'GSTIN', render: (row) => row.gstin || '—' },
        {
          key: 'creditLimit',
          header: 'Credit limit',
          className: 'text-right',
          render: (row) => formatCompactCurrency(row.creditLimit),
        },
        {
          key: 'outstandingAmount',
          header: 'Outstanding',
          className: 'text-right',
          render: (row) => (
            <span className={row.outstandingAmount > row.creditLimit ? 'font-medium text-danger-400' : ''}>
              {formatCompactCurrency(row.outstandingAmount)}
            </span>
          ),
        },
        { key: 'status', header: 'Status', render: (row) => <Badge status={row.status} /> },
      ]}
      fields={[
        { name: 'code', label: 'Customer code', required: true, uppercase: true },
        { name: 'name', label: 'Company name', required: true },
        {
          name: 'segment',
          label: 'Segment',
          type: 'select',
          required: true,
          defaultValue: 'distributor',
          options: SEGMENTS.map((segment) => ({ value: segment, label: humanise(segment) })),
        },
        { name: 'gstin', label: 'GSTIN', uppercase: true },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'phone', label: 'Phone' },
        { name: 'creditLimit', label: 'Credit limit (₹)', type: 'number', defaultValue: 0 },
        { name: 'paymentTermsDays', label: 'Payment terms (days)', type: 'number', defaultValue: 30 },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          required: true,
          defaultValue: 'active',
          options: STATUSES.map((status) => ({ value: status, label: humanise(status) })),
        },
        { name: 'website', label: 'Website' },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      ]}
    />
  );
}
