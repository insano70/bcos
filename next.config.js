// Validate environment variables at build time
require("./lib/env.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove hardcoded absolute path - use relative or dynamic
  experimental: {
    // Enable optimizations
    optimizePackageImports: ['@headlessui/react', '@tanstack/react-query'],
  },
  // Skip static generation for API routes during build
  output: 'standalone',
  // Security headers (additional to middleware)
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-DNS-Prefetch-Control',
          value: 'off'
        },
        {
          key: 'X-Frame-Options', 
          value: 'DENY'
        }
      ],
    },
  ],
};

module.exports = nextConfig;
