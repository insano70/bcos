export const metadata = {
  title: 'Thrive',
  description: 'Sign in to Thrive powered by Bendcare',
};

import { Suspense } from 'react';
import LoginForm from '@/components/auth/login-form';
import SplitText from '@/components/SplitText';
import AuthImage from '../auth-image';

function LoginFormWrapper() {
  return <LoginForm />;
}

export default function SignIn() {
  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative md:flex">
        {/* Content */}
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col justify-center">
            <div className="max-w-sm mx-auto w-full px-4 py-8">
              <SplitText
                text="Welcome back!"
                tag="h1"
                className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6"
                textAlign="left"
              />
              {/* Form */}
              <Suspense fallback={<div>Loading...</div>}>
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
