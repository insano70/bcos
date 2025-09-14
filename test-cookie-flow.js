#!/usr/bin/env node

/**
 * Systematic Cookie Flow Test
 * Tests the complete authentication cookie flow to identify issues
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:4001';

async function testCookieFlow() {
  console.log('🧪 COOKIE FLOW TEST STARTED');
  console.log('=====================================\n');

  try {
    // Step 1: Test server health
    console.log('📡 Step 1: Testing server health...');
    const healthResponse = await fetch(`${BASE_URL}/api/csrf`);
    console.log(`✅ Server responded: ${healthResponse.status}`);

    // Step 2: Get CSRF token
    console.log('\n🔐 Step 2: Getting CSRF token...');
    const csrfResponse = await fetch(`${BASE_URL}/api/csrf`);
    const csrfData = await csrfResponse.json();
    console.log(`✅ CSRF token obtained: ${csrfData.success ? 'YES' : 'NO'}`);

    // Step 3: Attempt login and check cookies
    console.log('\n🚀 Step 3: Attempting login...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfData.data.csrfToken
      },
      body: JSON.stringify({
        email: 'admin@test.com',
        password: 'test123!',
        remember: true
      }),
      redirect: 'manual' // Don't follow redirects
    });

    console.log(`✅ Login response status: ${loginResponse.status}`);

    // Check response cookies
    const loginCookies = loginResponse.headers.raw()['set-cookie'] || [];
    console.log(`🍪 Login response cookies count: ${loginCookies.length}`);

    loginCookies.forEach((cookie, index) => {
      console.log(`  Cookie ${index + 1}: ${cookie.split(';')[0]}`);
    });

    // Step 4: Make authenticated request
    console.log('\n🔒 Step 4: Testing authenticated request...');
    const protectedResponse = await fetch(`${BASE_URL}/api/users`, {
      method: 'GET',
      headers: {
        'Cookie': loginCookies.join('; ')
      }
    });

    console.log(`✅ Protected API response: ${protectedResponse.status}`);

    if (protectedResponse.status === 200) {
      const userData = await protectedResponse.json();
      console.log(`✅ Users API succeeded - found ${userData.data?.length || 0} users`);
    } else {
      const errorData = await protectedResponse.json();
      console.log(`❌ Users API failed: ${errorData.message}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  console.log('\n=====================================');
  console.log('🧪 COOKIE FLOW TEST COMPLETED');
}

// Run the test
testCookieFlow().catch(console.error);
