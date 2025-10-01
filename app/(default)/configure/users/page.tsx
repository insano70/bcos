export const metadata = {
  title: 'Users - BCOS',
  description: 'Manage system users',
};

import { SelectedItemsProvider } from '@/app/selected-items-context';
import { UserManagementPageProtection } from '@/components/rbac/protected-page';
import UsersContent from './users-content';

export default function Users() {
  return (
    <UserManagementPageProtection>
      <SelectedItemsProvider>
        <UsersContent />
      </SelectedItemsProvider>
    </UserManagementPageProtection>
  );
}
