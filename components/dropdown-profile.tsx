'use client';

import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth/rbac-auth-provider';

export default function DropdownProfile({ align }: { align?: 'left' | 'right' }) {
  const router = useRouter();
  const { logout } = useAuth();

  const handleSignOut = async () => {
    try {
      // Logout initiated (client-side debug)
      if (process.env.NODE_ENV === 'development') {
        console.log('Initiating logout from dropdown...');
      }

      // Use our custom logout
      await logout();

      // Redirect to signin
      router.push('/signin');
      router.refresh();
    } catch (error) {
      // Log client-side logout errors for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('Logout error:', error);
      }
      // Force redirect even if logout fails
      router.push('/signin');
    }
  };

  return (
    <Menu as="div" className="relative inline-flex">
      <MenuButton className="inline-flex justify-center items-center group">
        <div className="flex items-center truncate">
          <span className="truncate ml-2 text-sm font-medium text-gray-600 dark:text-gray-100 group-hover:text-gray-800 dark:group-hover:text-white">
            Bendcare
          </span>
          <svg
            className="w-3 h-3 shrink-0 ml-1 fill-current text-gray-400 dark:text-gray-500"
            viewBox="0 0 12 12"
          >
            <path d="M5.9 11.4L.5 6l1.4-1.4 4 4 4-4L11.3 6z" />
          </svg>
        </div>
      </MenuButton>
      <Transition
        as="div"
        className={`origin-top-right z-10 absolute top-full min-w-[11rem] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden mt-1 ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
        enter="transition ease-out duration-200 transform"
        enterFrom="opacity-0 -translate-y-2"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-out duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="pt-0.5 pb-2 px-3 mb-1 border-b border-gray-200 dark:border-gray-700/60">
          <div className="font-medium text-gray-800 dark:text-gray-100">Bendcare</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 italic">Administrator</div>
        </div>
        <MenuItems as="ul" className="focus:outline-hidden">
          <MenuItem as="li">
            <Link
              className="font-medium text-sm flex items-center py-1 px-3 text-violet-500"
              href="/settings/account"
            >
              Settings
            </Link>
          </MenuItem>
          <MenuItem as="li">
            <button type="button" onClick={handleSignOut}
              className="font-medium text-sm flex items-center py-1 px-3 text-violet-500 hover:text-violet-600 w-full text-left"
            >
              Sign Out
            </button>
          </MenuItem>
        </MenuItems>
      </Transition>
    </Menu>
  );
}
