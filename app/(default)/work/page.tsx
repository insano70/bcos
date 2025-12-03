import type { Metadata } from 'next';
import { SelectedItemsProvider } from '@/app/selected-items-context';
import { WorkItemErrorBoundary } from '@/components/work-items/work-item-error-boundary';
import WorkItemsContent from './work-items-content';

export const metadata: Metadata = {
  title: 'Work Items - BCOS',
  description: 'Manage work items and tasks',
};

export default function WorkItemsPage() {
  return (
    <SelectedItemsProvider>
      <WorkItemErrorBoundary context="Work Items List">
        <WorkItemsContent />
      </WorkItemErrorBoundary>
    </SelectedItemsProvider>
  );
}
