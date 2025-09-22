#!/usr/bin/env node
/**
 * Development Server Warmup Script
 * Pre-compiles common routes to eliminate compilation delays
 */

const routes = [
  'http://localhost:4001/',
  'http://localhost:4001/signin',
  'http://localhost:4001/dashboard',
  'http://localhost:4001/configure/users',
  'http://localhost:4001/configure/practices',
  'http://localhost:4001/configure/charts',
  'http://localhost:4001/configure/dashboards',
  'http://localhost:4001/api/health',
  'http://localhost:4001/api/csrf',
  'http://localhost:4001/api/auth/me'
];

async function warmupRoute(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'warmup-script'
      }
    });
    console.log(`✅ ${url} - ${response.status} (${response.statusText})`);
  } catch (error) {
    console.log(`❌ ${url} - Error: ${error.message}`);
  }
}

async function warmupServer() {
  console.log('🔥 Warming up development server...');
  console.log(`📍 Precompiling ${routes.length} routes`);
  
  const startTime = Date.now();
  
  // Warm up routes in parallel
  await Promise.all(routes.map(warmupRoute));
  
  const duration = Date.now() - startTime;
  console.log(`\n🎉 Warmup completed in ${duration}ms`);
  console.log('🚀 Server is ready for fast responses!');
}

// Run warmup
warmupServer().catch(console.error);
