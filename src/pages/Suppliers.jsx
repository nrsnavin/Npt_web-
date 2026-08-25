import CrudPage from '../components/CrudPage.jsx';
import { suppliers } from '../api/endpoints.js';
import { humanise } from '../utils/format.js';

const CATEGORIES = ['resin', 'metal', 'wood', 'paint', 'packaging', 'machinery', 'services', 'other'];

export default function Suppliers() {
  return (
    <CrudPage
      title="Suppliers"
      subtitle="Resin, wire, wood and packaging vendors"
      resourceKey="suppliers"
      resource={suppliers}
      entityName="supplier"
      writeRoles={['inventory', 'production']}
      searchPlaceholder="Search name, code, email…"
      defaultParams={{ sort: 'name' }}
      filters={[
        {
          key: 'category',
          label: 'All categories',
          options: CATEGORIES.map((category) => ({ value: category, label: humanise(category) })),
        },
      ]}
      columns={[
        {
          key: 'name',
          header: 'Supplier',
          render: (row) => (
            <div>
              <p className="font-medium text-steel-50">{row.name}</p>
              <p className="text-xs text-steel-500">{row.code}</p>
            </div>
          ),
        },
        { key: 'category', header: 'Category', render: (row) => humanise(row.category) },
        { key: 'contactPerson', header: 'Contact', render: (row) => row.contactPerson || '—' },
        {
          key: 'reach',
          header: 'Email / phone',
          render: (row) => (
            <div className="text-xs">
              <p>{row.email || '—'}</p>
              <p className="text-steel-500">{row.phone || '—'}</p>
            </div>
          ),
        },
        {
          key: 'leadTimeDays',
          header: 'Lead time',
          className: 'text-right',
          render: (row) => `${row.leadTimeDays} days`,
        },
        {
          key: 'rating',
          header: 'Rating',
          render: (row) => '★'.repeat(row.rating || 0).padEnd(5, '☆'),
        },
      ]}
      fields={[
        { name: 'code', label: 'Supplier code', required: true, uppercase: true },
        { name: 'name', label: 'Supplier name', required: true },
        {
          name: 'category',
          label: 'Category',
          type: 'select',
          required: true,
          defaultValue: 'resin',
          options: CATEGORIES.map((category) => ({ value: category, label: humanise(category) })),
        },
        { name: 'gstin', label: 'GSTIN', uppercase: true },
        { name: 'contactPerson', label: 'Contact person' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'phone', label: 'Phone' },
        { name: 'paymentTermsDays', label: 'Payment terms (days)', type: 'number', defaultValue: 30 },
        { name: 'leadTimeDays', label: 'Lead time (days)', type: 'number', defaultValue: 7 },
        {
          name: 'rating',
          label: 'Rating',
          type: 'select',
          defaultValue: 3,
          options: [1, 2, 3, 4, 5].map((value) => ({ value, label: `${value} star${value > 1 ? 's' : ''}` })),
        },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      ]}
    />
  );
}
