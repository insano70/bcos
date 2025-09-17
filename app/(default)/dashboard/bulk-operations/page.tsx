import BulkOperationsManager from '@/components/charts/bulk-operations-manager';

export const metadata = {
  title: 'Bulk Chart Operations',
  description: 'Manage multiple charts with bulk operations',
};

export default function BulkOperationsPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-9xl mx-auto">
      <BulkOperationsManager />
    </div>
  );
}
