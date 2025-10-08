import { Metadata } from 'next';
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
  return <WorkItemDetailContent workItemId={id} />;
}
