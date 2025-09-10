export const metadata = {
  title: 'Practices - BCOS',
  description: 'Manage rheumatology practices',
};

import { SelectedItemsProvider } from '@/app/selected-items-context';
import PracticesContent from './practices-content';

export default function Practices() {
  return (
    <SelectedItemsProvider>
      <PracticesContent />
    </SelectedItemsProvider>
  );
}
