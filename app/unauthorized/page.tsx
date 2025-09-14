export const metadata = {
  title: 'Access Denied - BCOS',
  description: 'You do not have permission to access this page',
};

import { UnauthorizedPage } from '@/components/rbac/protected-page';

export default function Unauthorized() {
  return <UnauthorizedPage />;
}
