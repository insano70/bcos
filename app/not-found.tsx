import Image from 'next/image';
import Link from 'next/link';
import NotFoundImage from '@/public/images/404-illustration.svg';
import NotFoundImageDark from '@/public/images/404-illustration-dark.svg';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center">
          <div className="inline-flex mb-8">
            <Image
              className="dark:hidden"
              src={NotFoundImage}
              width={176}
              height={176}
              alt="404 illustration"
            />
            <Image
              className="hidden dark:block"
              src={NotFoundImageDark}
              width={176}
              height={176}
              alt="404 illustration dark"
            />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Page Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link
            href="/signin"
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
