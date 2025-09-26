import './css/style.css';

import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import Theme from './theme-provider';
import AppProvider from './app-provider';
import QueryProvider from './query-provider';
import { RBACAuthProvider } from '@/components/auth/rbac-auth-provider';
import { NonceProvider } from './nonce-context';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'BendcareOS',
  description: 'Powered by Bendcare',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Get nonce from middleware headers for CSP compliance
  const headersList = await headers();
  const nonce = headersList.get('x-csp-nonce') || '';

  return (
    <html lang="en" className={`${inter.variable}`} suppressHydrationWarning>
      {/* suppressHydrationWarning: https://github.com/vercel/next.js/issues/44343 */}
      <head>
        {/* CSP nonce meta tag for Next.js internal scripts */}
        <meta name="csp-nonce" content={nonce} />
        {/* Pass nonce to client components via window global */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `window.__CSP_NONCE__ = '${nonce}';`,
          }}
        />
      </head>
      <body className="font-inter antialiased bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
        <NonceProvider nonce={nonce}>
          <RBACAuthProvider>
            <QueryProvider>
              <Theme>
                <AppProvider>{children}</AppProvider>
              </Theme>
            </QueryProvider>
          </RBACAuthProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
