import type { Metadata } from 'next';
import ReportCardAdmin from './report-card-admin';

export const metadata: Metadata = {
  title: 'Report Card Configuration',
  description: 'Configure report card measures and size bucket thresholds',
};

export default function ReportCardAdminPage() {
  return <ReportCardAdmin />;
}


