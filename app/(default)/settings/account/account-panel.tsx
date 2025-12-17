'use client';

import Image from 'next/image';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import AccountImage from '@/public/images/user-avatar-80.png';

export default function AccountPanel() {
  const [sync, setSync] = useState<boolean>(false);
  const nameId = useId();
  const businessIdId = useId();
  const locationId = useId();
  const emailId = useId();
  const toggleId = useId();

  return (
    <div className="grow">
      {/* Panel body */}
      <div className="p-6 space-y-6">
        <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-5">My Account</h2>
        {/* Picture */}
        <section>
          <div className="flex items-center">
            <div className="mr-4">
              <Image
                className="w-20 h-20 rounded-full"
                src={AccountImage}
                width={80}
                height={80}
                alt="User upload"
              />
            </div>
            <Button variant="secondary" size="sm">
              Change
            </Button>
          </div>
        </section>
        {/* Business Profile */}
        <section>
          <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">
            Business Profile
          </h2>
          <div className="text-sm">
            Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt
            mollit.
          </div>
          <div className="sm:flex sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 mt-5">
            <div className="sm:w-1/3">
              <label className="block text-sm font-medium mb-1" htmlFor={nameId}>
                Business Name
              </label>
              <input id={nameId} className="form-input w-full" type="text" />
            </div>
            <div className="sm:w-1/3">
              <label className="block text-sm font-medium mb-1" htmlFor={businessIdId}>
                Business ID
              </label>
              <input id={businessIdId} className="form-input w-full" type="text" />
            </div>
            <div className="sm:w-1/3">
              <label className="block text-sm font-medium mb-1" htmlFor={locationId}>
                Location
              </label>
              <input id={locationId} className="form-input w-full" type="text" />
            </div>
          </div>
        </section>
        {/* Email */}
        <section>
          <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">
            Email
          </h2>
          <div className="text-sm">
            Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia.
          </div>
          <div className="flex flex-wrap mt-5">
            <div className="mr-2">
              <label className="sr-only" htmlFor={emailId}>
                Business email
              </label>
              <input id={emailId} className="form-input" type="email" />
            </div>
            <Button variant="secondary">
              Change
            </Button>
          </div>
        </section>
        {/* Password */}
        <section>
          <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">
            Password
          </h2>
          <div className="text-sm">
            You can set a permanent password if you don't want to use temporary login codes.
          </div>
          <div className="mt-5">
            <Button variant="secondary">
              Set New Password
            </Button>
          </div>
        </section>
        {/* Smart Sync */}
        <section>
          <h2 className="text-xl leading-snug text-gray-800 dark:text-gray-100 font-bold mb-1">
            Smart Sync update for Mac
          </h2>
          <div className="text-sm">
            With this update, online-only files will no longer appear to take up hard drive space.
          </div>
          <div className="flex items-center mt-5">
            <div className="form-switch">
              <input
                type="checkbox"
                id={toggleId}
                className="sr-only"
                checked={sync}
                onChange={() => setSync(!sync)}
              />
              <label htmlFor={toggleId}>
                <span className="bg-white shadow-sm" aria-hidden="true"></span>
                <span className="sr-only">Enable smart sync</span>
              </label>
            </div>
            <div className="text-sm text-gray-400 dark:text-gray-500 italic ml-2">
              {sync ? 'On' : 'Off'}
            </div>
          </div>
        </section>
      </div>
      {/* Panel footer */}
      <footer>
        <div className="flex flex-col px-6 py-5 border-t border-gray-200 dark:border-gray-700/60">
          <div className="flex self-end">
            <Button variant="secondary">
              Cancel
            </Button>
            <Button variant="primary" className="ml-3">
              Save Changes
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
