export const metadata = {
  title: 'Practices - BCOS',
  description: 'Manage rheumatology practices',
};

import { SelectedItemsProvider } from '@/app/selected-items-context';
import { PracticeManagementPageProtection } from '@/components/rbac/protected-page';
import PracticesContent from './practices-content';

export default function Practices() {
  return (
    <PracticeManagementPageProtection>
      <SelectedItemsProvider>
        <PracticesContent />
      </SelectedItemsProvider>
    </PracticeManagementPageProtection>
  );
}
