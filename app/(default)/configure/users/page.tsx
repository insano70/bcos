export const metadata = {
  title: 'Users - BCOS',
  description: 'Manage system users',
};

import { SelectedItemsProvider } from '@/app/selected-items-context';
import UsersContent from './users-content';

export default function Users() {
  return (
    <SelectedItemsProvider>
      <UsersContent />
    </SelectedItemsProvider>
  );
}
