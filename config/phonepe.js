const crypto = require('crypto');
const createHttpClient = require('./axios');
const logger = require('./logger');

// ──────────── Environment configuration ────────────
// OAuth2 Standard Checkout credentials (new v2 API)
const CLIENT_ID = process.env.PHONEPE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || '';
const CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '1';
const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || '';

// Legacy salt-based auth (kept for webhook signature verification)
const SALT_KEY = process.env.PHONEPE_SALT_KEY || '';
const SALT_INDEX = process.env.PHONEPE_SALT_INDEX || '1';

const ENV = (process.env.PHONEPE_ENVIRONMENT || process.env.PHONEPE_ENV || 'sandbox').toLowerCase();
if (!['sandbox', 'production'].includes(ENV)) {
  throw new Error(`Invalid PHONEPE_ENV: ${ENV}. Must be 'sandbox' or 'production'.`);
}

// Base URLs
const BASE_URLS = {
  sandbox: process.env.PHONEPE_BASE_URL_SANDBOX || 'https://api-preprod.phonepe.com',
  production: process.env.PHONEPE_BASE_URL_PRODUCTION || 'https://api.phonepe.com'
};
const BASE_URL = BASE_URLS[ENV];

// API path prefix differs by environment
const API_PREFIX = ENV === 'sandbox' ? '/apis/pg-sandbox' : '/apis/hermes';

// Normalize APP_URL
function normalizeBaseUrl(raw, fallback) {
  const input = typeof raw === 'string' ? raw : '';
  const parts = input.split(',').map(v => v.trim()).filter(Boolean);
  return (parts[0] || fallback || 'https://app.snowcityblr.com').replace(/\/+$/, '');
}
const APP_URL = normalizeBaseUrl(process.env.APP_URL, 'https://app.snowcityblr.com');
const CLIENT_URL = (process.env.CLIENT_URL || 'https://www.snowcityblr.com').replace(/\/+$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://www.snowcityblr.com').replace(/\/+$/, '');

// Callback / redirect URLs
// CALLBACK_URL = backend webhook for server-to-server notification (no whitelisting needed)
let callbackUrlCandidate = (process.env.PHONEPE_CALLBACK_URL || '').trim();
if (!callbackUrlCandidate) {
  callbackUrlCandidate = `${APP_URL}/webhooks/phonepe/notify`;
} else {
  callbackUrlCandidate = callbackUrlCandidate.replace(/\$\{\s*APP_URL\s*\}/gi, APP_URL);
  if (/^\//.test(callbackUrlCandidate)) callbackUrlCandidate = `${APP_URL}${callbackUrlCandidate}`;
}
const CALLBACK_URL = callbackUrlCandidate;

// REDIRECT_URL — Option B: PhonePe redirects user directly to the whitelisted frontend domain
// The txnId is appended per-payment in initiatePayment()
const FRONTEND_PAYMENT_STATUS_BASE = `${FRONTEND_URL}/payment-status`;

// HTTP client (no default auth — we'll add Bearer per-request)
const http = createHttpClient({ baseURL: BASE_URL, timeout: 20000 });

logger.info(`PhonePe configured for ${ENV} environment`, {
  baseUrl: BASE_URL,
  hasOAuth: !!(CLIENT_ID && CLIENT_SECRET),
  hasLegacy: !!(SALT_KEY && MERCHANT_ID),
  paymentStatusBase: FRONTEND_PAYMENT_STATUS_BASE
});


// ──────────── OAuth2 Token Management ────────────
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get OAuth2 access token (cached until expiry)
 */
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 30000) {   // 30s buffer
    return cachedToken;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('PhonePe OAuth2 credentials not configured (PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET)');
  }

  const tokenUrl = `${API_PREFIX}/v1/oauth/token`;
  logger.info('PhonePe: fetching new OAuth2 access token', { url: tokenUrl });

  const res = await http.post(
    tokenUrl,
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_version: CLIENT_VERSION,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials'
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  const data = res.data || {};
  if (!data.access_token) {
    logger.error('PhonePe OAuth2 token response missing access_token', { data });
    throw new Error('Failed to obtain PhonePe access token');
  }

  cachedToken = data.access_token;
  tokenExpiresAt = data.expires_at ? data.expires_at * 1000 : now + 86400000; // default 24h

  logger.info('PhonePe: OAuth2 token obtained', {
    expiresAt: new Date(tokenExpiresAt).toISOString()
  });

  return cachedToken;
}

// ──────────── Legacy helpers (for webhook verification) ────────────
function generateXVerify(base64Payload, apiEndpoint) {
  const hash = crypto.createHash('sha256').update(base64Payload + apiEndpoint + SALT_KEY).digest('hex');
  return `${hash}###${SALT_INDEX}`;
}

function verifyCallbackSignature(base64Response, xVerifyHeader) {
  const expectedHash = crypto.createHash('sha256').update(base64Response + SALT_KEY).digest('hex');
  return expectedHash === (xVerifyHeader || '').split('###')[0];
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function decodeResponse(base64String) {
  return JSON.parse(Buffer.from(base64String, 'base64').toString('utf-8'));
}

// ──────────── Standard Checkout v2 – Initiate Payment ────────────
/**
 * @param {Object}  params
 * @param {string}  params.merchantTransactionId  Unique order/txn ID
 * @param {number}  params.amount                 Amount in RUPEES
 * @param {string}  params.merchantUserId         User identifier
 * @param {string}  params.mobileNumber           Customer mobile
 * @param {string}  [params.callbackUrl]          Post-payment webhook URL
 */
async function initiatePayment({
  merchantTransactionId,
  amount,
  merchantUserId,
  mobileNumber,
  callbackUrl = CALLBACK_URL
}) {
  // ── Validate config ──
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('PhonePe configuration incomplete. Missing CLIENT_ID or CLIENT_SECRET.');
  }

  // ── Validate params ──
  merchantTransactionId = String(merchantTransactionId).trim();
  if (!merchantTransactionId || !amount || !merchantUserId || !mobileNumber) {
    throw new Error('Missing required parameters for PhonePe payment initiation');
  }

  const amountInPaise = Math.round(Number(amount) * 100);
  if (amountInPaise < 100 || amountInPaise > 100000000) {
    throw new Error(`Invalid amount: ${amountInPaise} paise. Must be between 100 and 100,000,000 paise.`);
  }

  // ── Get OAuth2 token ──
  const accessToken = await getAccessToken();

  // ── Build redirect URL — Option B: points directly to whitelisted frontend domain
  // PhonePe will append orderId as a query param on some versions, but we bake it in for safety
  const redirectUrl = `${FRONTEND_PAYMENT_STATUS_BASE}?gateway=phonepe&txnId=${merchantTransactionId}`;

  // ── Build Standard Checkout v2 payload ──
  const payload = {
    merchantOrderId: merchantTransactionId,
    amount: amountInPaise,
    expireAfter: 1200,                  // 20 min
    metaInfo: {
      udf1: merchantUserId,
      udf2: mobileNumber
    },
    paymentFlow: {
      type: 'PG_CHECKOUT',
      message: 'Payment for SnowCity booking',
      merchantUrls: {
        redirectUrl: redirectUrl,
        callbackUrl: callbackUrl
      }
    }
  };

  const payEndpoint = `${API_PREFIX}/checkout/v2/pay`;

  logger.info('PhonePe initiate payment (OAuth2)', {
    merchantOrderId: merchantTransactionId,
    amount: amountInPaise,
    endpoint: payEndpoint,
    redirectUrl: REDIRECT_URL
  });

  try {
    const response = await http.post(payEndpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `O-Bearer ${accessToken}`
      }
    });

    const data = response.data || {};

    // Standard Checkout v2 returns orderId + redirectUrl at top level
    if (data.orderId && data.redirectUrl) {
      logger.info('PhonePe payment initiated successfully (v2)', {
        phonePeOrderId: data.orderId,
        merchantOrderId: merchantTransactionId,
        state: data.state
      });
      return {
        success: true,
        redirectUrl: data.redirectUrl,
        merchantTransactionId: merchantTransactionId, // ALWAYS return our ID for status check
        phonePeOrderId: data.orderId,
        raw: data
      };
    }

    // Fallback: older response format
    if (data.success && data.data?.instrumentResponse?.redirectInfo?.url) {
      return {
        success: true,
        redirectUrl: data.data.instrumentResponse.redirectInfo.url,
        merchantTransactionId,
        raw: data
      };
    }

    logger.warn('PhonePe payment initiation – unexpected response', { data });
    return {
      success: false,
      code: data.code,
      message: data.message || 'Payment initiation failed',
      raw: data
    };
  } catch (error) {
    // If 401 Unauthorized, clear cached token and retry once
    if (error.response?.status === 401 && cachedToken) {
      logger.warn('PhonePe: OAuth token expired, refreshing and retrying…');
      cachedToken = null;
      tokenExpiresAt = 0;
      return initiatePayment({ merchantTransactionId, amount, merchantUserId, mobileNumber, callbackUrl });
    }

    logger.error('PhonePe payment initiation error', {
      merchantTransactionId,
      status: error.response?.status,
      responseData: error.response?.data,
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Internal connection error',
      error
    };
  }
}

// ──────────── Check Payment Status ────────────
async function checkStatus(merchantTransactionId) {
  const accessToken = await getAccessToken();
  const endpoint = `${API_PREFIX}/checkout/v2/order/${merchantTransactionId}/status`;

  logger.info('PhonePe checking status (v2)', { merchantTransactionId, endpoint });

  const response = await http.get(endpoint, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `O-Bearer ${accessToken}`
    }
  });

  const data = response.data || {};
  const isSuccess = data.state === 'COMPLETED';

  logger.info('PhonePe status check result', {
    merchantTransactionId,
    success: isSuccess,
    state: data.state,
    fullResponse: data
  });

  return {
    success: isSuccess,
    code: data.code || data.state,
    message: data.message,
    state: data.state,
    transactionId: data.orderId || data.transactionId,
    amount: data.amount,
    raw: data
  };
}

// ──────────── Initiate Refund ────────────
async function initiateRefund({
  merchantTransactionId,
  refundTransactionId,
  amount
}) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('PhonePe configuration incomplete. Missing CLIENT_ID or CLIENT_SECRET.');
  }
  if (!merchantTransactionId || !refundTransactionId || !amount) {
    throw new Error('Missing required parameters for PhonePe refund initiation');
  }

  const amountInPaise = Math.round(Number(amount) * 100);
  if (amountInPaise < 100 || amountInPaise > 100000000) {
    throw new Error(`Invalid refund amount: ${amountInPaise} paise.`);
  }

  const accessToken = await getAccessToken();

  const payload = {
    merchantOrderId: merchantTransactionId,
    merchantRefundId: refundTransactionId,
    originalTransactionId: merchantTransactionId,
    amount: amountInPaise
  };

  logger.info('PhonePe initiate refund (v2)', {
    originalTxn: merchantTransactionId,
    refundTxn: refundTransactionId,
    amount: amountInPaise
  });

  const response = await http.post(`${API_PREFIX}/checkout/v2/refund`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `O-Bearer ${accessToken}`
    }
  });

  const data = response.data || {};
  return {
    success: data.state === 'COMPLETED' || data.success === true,
    code: data.code || data.state,
    message: data.message,
    raw: data
  };
}

// ──────────── Helpers ────────────
function isSuccessStatus(statusResponse) {
  const state = statusResponse?.state || statusResponse?.raw?.state;
  const code = statusResponse?.code || statusResponse?.raw?.code;

  return (
    statusResponse?.success === true ||
    state === 'COMPLETED' ||
    state === 'SUCCESS' ||
    code === 'PAYMENT_SUCCESS'
  );
}

function verifyWebhookSignature(req) {
  const signature = req.headers['x-verify'] || req.headers['x-verify-sha256'];
  if (!signature) return false;

  // PhonePe V2 webhook payload is { response: "base64EncodedString" }
  // Signature is SHA256(responseBase64 + SALT_KEY) + ### + SALT_INDEX
  let payloadBase64;
  if (req.body && req.body.response) {
    payloadBase64 = req.body.response;
  } else {
    // Fallback? Or maybe raw body?
    // In V2, the body is JSON { "response": "..." }
    // If body parser worked, we use req.body.response
    // If not, we might be in trouble, but let's assume body parser is on.
    logger.warn('PhonePe Webhook verification: payload missing response field', { body: req.body });
    return false;
  }

  const expected = `${crypto.createHash('sha256').update(payloadBase64 + SALT_KEY).digest('hex')}###${SALT_INDEX}`;
  return signature === expected;
}

module.exports = {
  BASE_URL,
  MERCHANT_ID,
  CALLBACK_URL,

  // Utility functions
  generateXVerify,
  verifyCallbackSignature,
  encodePayload,
  decodeResponse,

  // API functions
  initiatePayment,
  checkStatus,
  initiateRefund,
  isSuccessStatus,
  verifyWebhookSignature
};