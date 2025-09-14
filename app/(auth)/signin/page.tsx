export const metadata = {
  title: 'Sign In - BendcareOS',
  description: 'Page description',
};

import { Suspense } from 'react';
import AuthImage from '../auth-image';
import LoginForm from '@/components/auth/login-form';
import SplitText from '@/components/SplitText';

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
                delay={50}
                duration={0.8}
                ease="power3.out"
                splitType="chars"
                from={{ opacity: 0, y: 30, scale: 0.8 }}
                to={{ opacity: 1, y: 0, scale: 1 }}
                threshold={0.8}
                rootMargin="0px"
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
