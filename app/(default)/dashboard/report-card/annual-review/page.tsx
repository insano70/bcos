import type { Metadata } from 'next';
import AnnualReviewView from './annual-review-view';

export const metadata: Metadata = {
  title: 'Annual Review | Practice Report Card',
  description: 'View year-over-year performance trends, forecasts, and comprehensive annual analysis',
};

export default function AnnualReviewPage() {
  return <AnnualReviewView />;
}

