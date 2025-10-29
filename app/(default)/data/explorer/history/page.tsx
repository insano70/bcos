import { SelectedItemsProvider } from '@/app/selected-items-context';
import QueryHistoryContent from './history-content';

export const metadata = {
  title: 'Data Explorer History',
  description: 'View and analyze past Data Explorer queries',
};

export default function QueryHistoryPage() {
  return (
    <SelectedItemsProvider>
      <QueryHistoryContent />
    </SelectedItemsProvider>
  );
}
