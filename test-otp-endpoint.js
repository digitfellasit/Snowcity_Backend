/**
 * Quick test script for OTP endpoints
 * Run: node backend/test-otp-endpoint.js
 */

const http = require('http');

const BASE_URL = 'https://app.snowcity.blr';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function test() {
  console.log('Testing OTP endpoints...\n');

  // Test 1: Check if server is running
  console.log('1. Testing server health...');
  try {
    const health = await makeRequest('GET', '/health');
    console.log('   ✓ Server is running:', health.status === 200 ? 'OK' : health.status);
  } catch (err) {
    console.log('   ✗ Server is not running:', err.message);
    console.log('   Please start the server first: cd backend && npm run dev');
    return;
  }

  // Test 2: Test OTP send endpoint
  console.log('\n2. Testing POST /api/auth/otp/send...');
  try {
    const result = await makeRequest('POST', '/api/auth/otp/send', {
      email: 'test@example.com',
      phone: '+1234567890',
      name: 'Test User',
      channel: 'sms',
      createIfNotExists: true,
    });
    console.log('   Status:', result.status);
    console.log('   Response:', JSON.stringify(result.data, null, 2));
    if (result.status === 200 || result.status === 201) {
      console.log('   ✓ OTP sent successfully');
    } else {
      console.log('   ✗ Failed to send OTP');
    }
  } catch (err) {
    console.log('   ✗ Error:', err.message);
  }

  // Test 3: List all routes (if available)
  console.log('\n3. Testing route registration...');
  try {
    const api = await makeRequest('GET', '/api');
    console.log('   API root:', api.status === 200 ? 'OK' : api.status);
  } catch (err) {
    console.log('   Error:', err.message);
  }

  console.log('\nTest completed!');
}

test().catch(console.error);

