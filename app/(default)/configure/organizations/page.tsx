export const metadata = {
  title: 'Organizations - BCOS',
  description: 'Manage organizations and their hierarchies',
};

import { SelectedItemsProvider } from '@/app/selected-items-context';
import OrganizationsContent from './organizations-content';

export default function OrganizationsPage() {
  return (
    <SelectedItemsProvider>
      <OrganizationsContent />
    </SelectedItemsProvider>
  );
}
