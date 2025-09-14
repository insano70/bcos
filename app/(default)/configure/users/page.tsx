export const metadata = {
  title: 'Users - BCOS',
  description: 'Manage system users',
};

import { SelectedItemsProvider } from '@/app/selected-items-context';
import UsersContent from './users-content';
import { UserManagementPageProtection } from '@/components/rbac/protected-page';

export default function Users() {
  return (
    <UserManagementPageProtection>
      <SelectedItemsProvider>
        <UsersContent />
      </SelectedItemsProvider>
    </UserManagementPageProtection>
  );
}
