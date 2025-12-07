import './css/style.css';

import { Inter } from 'next/font/google';
import { RBACAuthProvider } from '@/components/auth/rbac-auth-provider';
import { NonceProvider } from '@/lib/security/nonce-context';
import { getServerNonces } from '@/lib/security/nonce-server';
import AppProvider from './app-provider';
import QueryProvider from './query-provider';
import Theme from './theme-provider';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'Bendcare Thrive',
  description: 'Bendcare Thrive',
  manifest: '/manifest.json',
  icons: {
    apple: '/thrive_app_logo_180.png',
  },
};

/**
 * Viewport configuration for mobile devices
 * - viewport-fit: cover enables safe area insets for notched devices (iPhone X+)
 * - Allows proper rendering on devices with notches/Dynamic Island
 */
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Extract CSP nonces from middleware headers
  const nonces = await getServerNonces();

  return (
    <html lang="en" className={`${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Google Fonts with CSP-friendly preconnect */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Load fonts via link tag for better CSP control */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* suppressHydrationWarning: https://github.com/vercel/next.js/issues/44343 */}
      <body className="font-inter antialiased bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400">
        <NonceProvider
          scriptNonce={nonces.scriptNonce}
          styleNonce={nonces.styleNonce}
          timestamp={nonces.timestamp}
          environment={nonces.environment}
        >
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
