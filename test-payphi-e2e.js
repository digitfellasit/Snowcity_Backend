// PayPhi End-to-End Test Script
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const payphi = require('./config/payphi');

async function testPayPhiE2E() {
    console.log('\n🧪 Starting PayPhi E2E Test...\n');

    // 1. Check Configuration
    console.log('📋 1. Configuration Check:');
    console.log('   Base URL:', payphi.BASE);
    console.log('   Merchant ID:', process.env.PAYPHI_MERCHANT_ID ? '✅ Set' : '❌ Missing');
    console.log('   Secret Key:', process.env.PAYPHI_SECRET_KEY ? '✅ Set' : '❌ Missing');

    if (!process.env.PAYPHI_MERCHANT_ID || !process.env.PAYPHI_SECRET_KEY) {
        console.error('❌ Missing PayPhi credentials. Aborting.');
        return;
    }
    console.log('   ✅ Configuration looks good.\n');

    // 2. Initiate Payment
    console.log('🚀 2. Initiating Payment (initiateSale)...');
    const merchantTxnNo = 'TEST_PAYPHI_' + Date.now();
    const amount = 100.00;

    let tranCtx = null;

    try {
        const startTime = Date.now();
        const result = await payphi.initiateSale({
            merchantTxnNo: merchantTxnNo,
            amount: amount,
            customerEmailID: 'test@example.com',
            customerMobileNo: '9999999999',
            addlParam1: 'E2E_TEST',
            addlParam2: 'GroupOrder'
        });
        const duration = Date.now() - startTime;

        const code = result.responseCode || result.code;
        const redirectURI = result.redirectURI || result.redirectUri;
        tranCtx = result.tranCtx || result.tranctx || (result.response && result.response.tranCtx);

        if (redirectURI && tranCtx) {
            console.log(`   ✅ Payment Initiated Successfully! (${duration}ms)`);
            console.log('   Merchant Txn No:', merchantTxnNo);
            console.log('   TranCtx:', tranCtx);
            console.log('   Redirect URI:', redirectURI);
        } else {
            console.error('   ❌ Payment Initiation Failed');
            console.log('   Response:', JSON.stringify(result, null, 2));
            return;
        }
        console.log('\n');

        // 3. Check Status (Expect Pending/Failure since we didn't complete it)
        console.log('🔍 3. Checking Status (command -> STATUS)...');
        try {
            const statusResult = await payphi.command({
                merchantTxnNo: merchantTxnNo,
                transactionType: 'STATUS',
                amount: amount
            });

            const statusCode = statusResult.responseCode || statusResult.respCode;
            const statusMsg = statusResult.responseMessage || statusResult.respMessage;
            const status = statusResult.transactionStatus || statusResult.status;

            console.log(`   ✅ Status Check Call Successful`);
            console.log('   Response Code:', statusCode);
            console.log('   Status:', status);
            console.log('   Message:', statusMsg);
            console.log('   Full Response:', JSON.stringify(statusResult, null, 2));

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

testPayPhiE2E();
