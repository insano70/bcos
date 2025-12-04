import type { Metadata } from 'next';
import ReportCardView from './report-card-view';

export const metadata: Metadata = {
  title: 'Practice Report Card',
  description: 'View practice performance metrics, trends, and peer comparisons',
};

export default function ReportCardPage() {
  return <ReportCardView />;
}

