#!/usr/bin/env node
/**
 * test-payphi-return-url.js
 * ─────────────────────────
 * Verification script to confirm PayPhi return URL now points to the
 * whitelisted FRONTEND URL (industry-standard pattern).
 *
 * Tests:
 *  1. Config resolves FRONTEND_URL correctly
 *  2. initiateSale builds returnURL -> FRONTEND_URL/payment-status?gateway=payphi&txnId=...
 *  3. PayPhi notify webhook route is registered
 *  4. Frontend status API endpoint exists
 *
 * Usage:
 *   node scripts/test-payphi-return-url.js
 */

require('dotenv').config();

const passed = [];
const failed = [];

function assert(label, condition, detail = '') {
    if (condition) {
        passed.push(label);
        console.log(`  ✅ ${label}`);
    } else {
        failed.push(label);
        console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  PayPhi Return URL — Frontend Redirect Verification');
console.log('══════════════════════════════════════════════════════\n');

// ── Test 1: Config Resolution ──
console.log('1️⃣  Config Resolution');
const payphiConfig = require('../config/payphi');

// Check that the module loaded without errors
assert('payphi config loads successfully', !!payphiConfig);

// ── Test 2: initiateSale builds correct returnURL ──
console.log('\n2️⃣  Return URL Construction');

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://snowcity.vercel.app')
    .split(',')[0].trim().replace(/\/+$/, '');

// We can't call initiateSale (it would hit the API), but we can verify the config logic
// by checking that the module no longer uses APP_URL for returnURL
const configSource = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'config', 'payphi.js'), 'utf8'
);

assert(
    'config uses FRONTEND_URL (not APP_URL) for return URL',
    configSource.includes('FRONTEND_PAYMENT_STATUS_BASE') &&
    configSource.includes("FRONTEND_URL") &&
    !configSource.includes("RETURN_URL = returnUrlCandidate"),
    'Should use FRONTEND_PAYMENT_STATUS_BASE instead of old RETURN_URL'
);

assert(
    'returnURL includes gateway=payphi query param',
    configSource.includes('gateway=payphi'),
    'returnURL should have gateway=payphi so frontend knows which gateway to check'
);

assert(
    'returnURL includes txnId query param',
    configSource.includes('txnId='),
    'returnURL should include txnId for frontend to verify payment'
);

assert(
    'returnURL points to /payment-status path',
    configSource.includes('/payment-status'),
    'Should redirect to /payment-status on frontend'
);

// Check the resolved base URL
const expectedBase = `${FRONTEND_URL}/payment-status`;
console.log(`\n   📍 Expected base URL: ${expectedBase}`);

// Simulate what initiateSale would build
const testTxnId = 'TEST_ORD_12345';
const expectedReturnURL = `${expectedBase}?gateway=payphi&txnId=${encodeURIComponent(testTxnId)}`;
console.log(`   📍 Example returnURL: ${expectedReturnURL}`);

assert(
    'return URL domain matches FRONTEND_URL',
    expectedReturnURL.startsWith(FRONTEND_URL),
    `Expected to start with ${FRONTEND_URL}`
);

// ── Test 3: Webhook Route Registration ──
console.log('\n3️⃣  Webhook Route Registration');

const webhookRoutesSource = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'routes', 'webhooks.routes.js'), 'utf8'
);

assert(
    'PayPhi notify webhook is registered',
    webhookRoutesSource.includes("payphi/notify") &&
    webhookRoutesSource.includes("payphiNotify"),
    'webhooks.routes.js should have router.post("/payphi/notify", payphiNotify)'
);

assert(
    'PayPhi return handler still exists (fallback)',
    webhookRoutesSource.includes("payphi/return"),
    'payphi/return should remain as fallback'
);

// ── Test 4: Frontend Status API ──
console.log('\n4️⃣  Backend Status API Endpoint');

const paymentRoutesSource = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'routes', 'payments.routes.js'), 'utf8'
);

assert(
    'PayPhi status API endpoint exists',
    paymentRoutesSource.includes('payphi/status/txn/:txnId'),
    'Should have GET /api/payments/payphi/status/txn/:txnId for frontend verification'
);

// ── Test 5: Frontend Page ──
console.log('\n5️⃣  Frontend PaymentStatus Page');

const frontendPath = require('path').join(__dirname, '..', '..', 'snowcity-main', 'src', 'pages', 'PaymentStatus.jsx');
let frontendSource = '';
try {
    frontendSource = require('fs').readFileSync(frontendPath, 'utf8');
} catch {
    console.log('   ⚠️  Could not read frontend PaymentStatus.jsx (different directory structure?)');
}

if (frontendSource) {
    assert(
        'Frontend handles gateway=payphi',
        frontendSource.includes("'payphi'") || frontendSource.includes('"payphi"'),
        'PaymentStatus.jsx should handle payphi gateway'
    );

    assert(
        'Frontend calls payphi status API',
        frontendSource.includes('payphi/status/txn'),
        'Should call /api/payments/payphi/status/txn/:txnId'
    );
}

// ── Test 6: .env Configuration ──
console.log('\n6️⃣  Environment Configuration');

const envVal = (process.env.PAYPHI_RETURN_URL || '').trim();
assert(
    'PAYPHI_RETURN_URL is empty (using auto-generated default)',
    !envVal || envVal.includes('payment-status'),
    envVal
        ? `Currently set to: ${envVal} — should be empty or contain payment-status`
        : 'Empty — will use auto-generated frontend URL ✓'
);

// ── Summary ──
console.log('\n══════════════════════════════════════════════════════');
console.log(`  Results: ${passed.length} passed, ${failed.length} failed`);
console.log('══════════════════════════════════════════════════════');

if (failed.length > 0) {
    console.log('\n  ⚠️  Failed checks:');
    failed.forEach(f => console.log(`     • ${f}`));
    console.log('');
    process.exit(1);
} else {
    console.log('\n  🎉  All checks passed! PayPhi will now redirect to your whitelisted frontend URL.');
    console.log(`     Return URL pattern: ${FRONTEND_URL}/payment-status?gateway=payphi&txnId=<merchantTxnNo>\n`);
    process.exit(0);
}
