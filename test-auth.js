// Simple test script to verify authentication flow
const http = require('http');

// Test 1: Check if server is running
console.log('🧪 Testing authentication flow...');

const testRequest = (path, method = 'GET', headers = {}) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4001,
      path: path,
      method: method,
      headers: {
        'User-Agent': 'TestScript/1.0',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
};

// Test sequence
async function runTests() {
  try {
    console.log('\n1️⃣ Testing server health...');
    const health = await testRequest('/api/health');
    console.log('✅ Health check:', health.status);

    console.log('\n2️⃣ Testing unauthenticated API access...');
    try {
      const users = await testRequest('/api/users');
      console.log('❌ Should have failed, but got:', users.status);
    } catch (error) {
      console.log('✅ Correctly blocked unauthenticated access');
    }

    console.log('\n3️⃣ Testing signin page...');
    const signin = await testRequest('/signin');
    console.log('✅ Signin page:', signin.status);

    console.log('\n🎯 Authentication flow test complete!');
    console.log('💡 Next: Try logging in manually and accessing /configure/users');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

runTests();
