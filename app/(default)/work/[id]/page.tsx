import type { Metadata } from 'next';
import { WorkItemErrorBoundary } from '@/components/work-items/work-item-error-boundary';
import WorkItemDetailContent from './work-item-detail-content';

export const metadata: Metadata = {
  title: 'Work Item Details - BCOS',
  description: 'View and manage work item details',
};

interface WorkItemDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function WorkItemDetailPage({ params }: WorkItemDetailPageProps) {
  const { id } = await params;
  return (
    <WorkItemErrorBoundary context="Work Item Details">
      <WorkItemDetailContent workItemId={id} />
    </WorkItemErrorBoundary>
  );
}
