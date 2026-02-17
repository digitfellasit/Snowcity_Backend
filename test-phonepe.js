// PhonePe configuration test script
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const phonepe = require('./config/phonepe');

async function testPhonePeConfig() {
  console.log('🧪 Testing PhonePe Configuration...\n');

  // Check environment variables
  console.log('📋 Configuration:');
  console.log('   Merchant ID:', process.env.PHONEPE_MERCHANT_ID);
  console.log('   Salt Key:', process.env.PHONEPE_SALT_KEY ? 'Set' : 'Missing');
  console.log('   Salt Index:', process.env.PHONEPE_SALT_INDEX);
  console.log('   Environment:', process.env.PHONEPE_ENV);
  console.log('   Base URL:', phonepe.BASE_URL);
  console.log();

  // Test API call
  console.log('🔗 Testing PhonePe API call...');

  try {
    const result = await phonepe.initiatePayment({
      merchantTransactionId: 'TEST_' + Date.now(),
      amount: 10000, // 100 rupees in paise
      merchantUserId: 'TEST_USER',
      mobileNumber: '9999999999'
    });

    console.log('✅ API Call Successful!');
    console.log('   Success:', result.success);
    if (result.success && result.redirectUrl) {
      console.log('   Redirect URL:', result.redirectUrl.substring(0, 50) + '...');
    } else {
      console.log('   Error:', result.message || result.code || 'Unknown error');
    }

  } catch (error) {
    console.log('❌ API Call Failed!');
    console.log('   Error:', error.message);
    console.log('   Status:', error.response?.status);
    console.log('   Response:', error.response?.data);
  }
}

testPhonePeConfig();
