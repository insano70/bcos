// Validate environment variables at build time
require("./lib/env.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker builds
  output: 'standalone',
  
  // Remove hardcoded absolute path - use relative or dynamic
  experimental: {
    // Enable optimizations
    optimizePackageImports: ['@headlessui/react', '@tanstack/react-query'],
  },
};

module.exports = nextConfig;
