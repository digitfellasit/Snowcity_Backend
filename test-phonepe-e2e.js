// PhonePe Standard Checkout V2 End-to-End Test
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const phonepe = require('./config/phonepe');

async function testPhonePeE2E() {
    console.log('\n🧪 Starting PhonePe Standard Checkout V2 E2E Test...\n');

    // 1. Check Configuration
    console.log('📋 1. Configuration Check:');
    console.log('   Environment:', process.env.PHONEPE_ENV || 'sandbox');
    console.log('   Client ID:', process.env.PHONEPE_CLIENT_ID ? '✅ Set (' + process.env.PHONEPE_CLIENT_ID + ')' : '❌ Missing');
    console.log('   Client Secret:', process.env.PHONEPE_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
    console.log('   Callback URL:', phonepe.CALLBACK_URL);
    console.log('   Base URL:', phonepe.BASE_URL);

    if (!process.env.PHONEPE_CLIENT_ID || !process.env.PHONEPE_CLIENT_SECRET) {
        console.error('❌ Missing OAuth2 credentials. Aborting.');
        return;
    }
    console.log('   ✅ Configuration looks good.\n');

    // 2. Initiate Payment
    console.log('🚀 2. Initiating Payment (OAuth2 -> /checkout/v2/pay)...');
    const merchantTxnId = 'TEST_' + Date.now();
    const amount = 100; // 100 rupees

    try {
        const startTime = Date.now();
        const result = await phonepe.initiatePayment({
            merchantTransactionId: merchantTxnId,
            amount: amount, // Service expects rupees, converts to paise internally
            merchantUserId: 'TEST_USER_E2E',
            mobileNumber: '9999999999'
        });
        const duration = Date.now() - startTime;

        if (result.success) {
            console.log(`   ✅ Payment Initiated Successfully! (${duration}ms)`);
            console.log('   Merchant Txn ID:', result.merchantTransactionId);
            console.log('   Redirect URL:', result.redirectUrl);
            console.log('   State:', result.raw?.state || 'N/A');
        } else {
            console.error('   ❌ Payment Initiation Failed');
            console.error('   Message:', result.message);
            console.error('   Code:', result.code);
            if (result.raw) console.error('   Raw Response:', JSON.stringify(result.raw, null, 2));
            return;
        }
        console.log('\n');

        // 3. Check Status (Immediate)
        console.log('🔍 3. Checking Status (Expect PENDING/PAYMENT_PENDING)...');
        try {
            const statusResult = await phonepe.checkStatus(merchantTxnId);
            console.log(`   ✅ Status Check Successful`);
            console.log('   State:', statusResult.state);
            console.log('   Message:', statusResult.message);
            console.log('   Code:', statusResult.code);
        } catch (statusErr) {
            console.error('   ❌ Status Check Failed');
            console.error('   Error:', statusErr.message);
        }

    } catch (error) {
        console.error('\n❌ Test Failed with Exception:');
        console.error(error);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
    console.log('\n🏁 Test Complete\n');
}

testPhonePeE2E();
