export const metadata = {
  title: 'Thrive',
  description: 'Sign in to Thrive powered by Bendcare',
};

import { Suspense } from 'react';
import Image from 'next/image';
import LoginForm from '@/components/auth/login-form';
import SplitText from '@/components/SplitText';
import AuthImage from '../auth-image';
import ThriveLogo from '@/public/Thrive.png';

function LoginFormWrapper() {
  return <LoginForm />;
}

function LoginFormFallback() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      {/* Inline skeleton that preserves layout while the client form hydrates */}
      <div className="h-11 w-full rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300 dark:border-gray-600" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white dark:bg-gray-900 px-2 text-gray-500 dark:text-gray-400">
            Loading sign-in…
          </span>
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>
      <div className="flex items-center justify-between mt-6">
        <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        <div className="h-10 w-28 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative md:flex">
        {/* Content */}
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col justify-center">
            <div className="max-w-sm mx-auto w-full px-4 py-8">
              {/* Logo - Mobile Only */}
              <div className="md:hidden mb-8 flex justify-center">
                <Image
                  src={ThriveLogo}
                  alt="Thrive"
                  width={298}
                  height={75}
                  priority
                  className="w-[18.75rem] h-auto"
                />
              </div>
              <SplitText
                text="Welcome back!"
                tag="h1"
                className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6"
                textAlign="left"
              />
              {/* Form */}
              <Suspense fallback={<LoginFormFallback />}>
                <LoginFormWrapper />
              </Suspense>
              {/* Removed signup link and outdated notice */}
            </div>
          </div>
        </div>

        <AuthImage />
      </div>
    </main>
  );
}
