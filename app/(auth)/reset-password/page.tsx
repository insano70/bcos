'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { FormLabel } from '@/components/ui/form-label';
import AuthHeader from '../auth-header';
import AuthImage from '../auth-image';

export default function ResetPassword() {
  const emailId = useId();

  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative md:flex">
        {/* Content */}
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">
            <AuthHeader />

            <div className="max-w-sm mx-auto w-full px-4 py-8">
              <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6">
                Reset your Password
              </h1>
              {/* Form */}
              <form>
                <div className="space-y-4">
                  <div>
                    <FormLabel htmlFor={emailId} required className="mb-1">
                      Email Address
                    </FormLabel>
                    <input id={emailId} className="form-input w-full" type="email" />
                  </div>
                </div>
                <div className="flex justify-end mt-6">
                  <Button type="button" variant="primary">
                    Send Reset Link
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <AuthImage />
      </div>
    </main>
  );
}
