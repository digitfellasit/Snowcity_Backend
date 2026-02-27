const crypto = require('crypto');
const createHttpClient = require('./axios');
const logger = require('./logger');

const BASE = (process.env.PAYPHI_BASE_URL || 'https://qa.phicommerce.com/pg').replace(/\/+$/, '');
const SECRET = process.env.PAYPHI_SECRET_KEY || '';
const MERCHANT_ID = process.env.PAYPHI_MERCHANT_ID || '';

function normalizeBaseUrl(raw, fallback) {
  const input = typeof raw === 'string' ? raw : '';
  const parts = input
    .split(',')
    .map((val) => val.trim())
    .filter(Boolean);
  const chosen = parts[0] || fallback || '';
  return (chosen || fallback || 'https://app.snowcityblr.com').replace(/\/+$/, '');
}

const APP_URL = normalizeBaseUrl(process.env.APP_URL, 'https://app.snowcityblr.com');

let returnUrlCandidate = (process.env.PAYPHI_RETURN_URL || '').trim();
if (!returnUrlCandidate) {
  returnUrlCandidate = `${APP_URL}/api/webhooks/payphi/return`;
} else {
  returnUrlCandidate = returnUrlCandidate.replace(/\$\{\s*APP_URL\s*\}/gi, APP_URL);
  if (/^\//.test(returnUrlCandidate)) {
    returnUrlCandidate = `${APP_URL}${returnUrlCandidate}`;
  }
}
const RETURN_URL = returnUrlCandidate;

const httpV2 = createHttpClient({ baseURL: `${BASE}/api/v2`, timeout: 20000 });
const http = createHttpClient({ baseURL: `${BASE}/api`, timeout: 20000 });

// 15-digit txnDate: YYYYMMDDHHmmssS (first digit of ms)
function formatTxnDate(date = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const yyyy = date.getUTCFullYear();
  const MM = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const HH = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  const S = String(date.getUTCMilliseconds()).padStart(3, '0')[0];
  return `${yyyy}${MM}${dd}${HH}${mm}${ss}${S}`;
}

// Canonical concat per spec:
// - Sort parameter names ascending
// - Exclude keys with null/undefined/''
// - Exclude secureHash
// - Include all others present
function buildCanonicalConcatString(obj) {
  const keys = Object.keys(obj || {})
    .filter((k) => k !== 'secureHash' && obj[k] !== null && obj[k] !== undefined && String(obj[k]) !== '')
    .sort(); // ascending by parameter name
  return keys.map((k) => String(obj[k])).join('');
}

// HMAC-SHA256 -> lowercase hex
function hmacSha256HexLower(text, secret) {
  return crypto.createHmac('sha256', secret).update(text, 'utf8').digest('hex');
}

// For debugging: show how we built the hashText (do NOT log secrets)
function debugHash(kind, obj, hash) {
  if (String(process.env.PAYPHI_DEBUG || 'false').toLowerCase() !== 'true') return;
  const keys = Object.keys(obj || {}).sort();
  logger.info(`PayPhi ${kind} hash debug`, {
    keysIncluded: keys.filter((k) => k !== 'secureHash' && obj[k] !== null && obj[k] !== undefined && String(obj[k]) !== ''),
    textLength: buildCanonicalConcatString(obj).length,
    computedSecureHash: hash
  });
}

// PUBLIC: initiate request hashing (HMAC over canonical string)
function computeInitiateHash(payload) {
  const text = buildCanonicalConcatString(payload);
  const h = hmacSha256HexLower(text, SECRET);
  debugHash('initiate', payload, h);
  return h;
}

// PUBLIC: command (STATUS/REFUND) hashing (same canonical builder)
function computeCommandHash(payload) {
  const text = buildCanonicalConcatString(payload);
  const h = hmacSha256HexLower(text, SECRET);
  debugHash('command', payload, h);
  return h;
}

// Safe redirect builder
function buildRedirectUrl(redirectURI, tranCtx) {
  if (!redirectURI) return null;
  const base = String(redirectURI).replace(/\?+$/, '');
  if (!tranCtx) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}tranCtx=${encodeURIComponent(tranCtx)}`;
}

async function initiateSale({
  merchantTxnNo,
  amount,
  customerEmailID,
  customerMobileNo,
  currencyCode = '356',
  payType = '0',
  transactionType = 'SALE',
  txnDate = formatTxnDate(),
  returnURL = RETURN_URL,
  addlParam1 = '',
  addlParam2 = '',
  // allow extra params if needed (included in hash if non-empty as per spec)
  ...rest
}) {
  const amountStr = typeof amount === 'number' ? amount.toFixed(2) : String(amount);

  const payload = {
    merchantId: MERCHANT_ID,
    merchantTxnNo,
    amount: amountStr,
    currencyCode,
    payType,
    customerEmailID,
    transactionType,
    txnDate,
    returnURL,
    customerMobileNo,
    addlParam1,
    addlParam2,
    ...rest,
  };

  payload.secureHash = computeInitiateHash(payload);

  const resp = await httpV2.post('/initiateSale', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const data = resp.data || {};
  const code = String(data.responseCode || data.code || '').toUpperCase();
  const redirectURI = data.redirectURI || data.redirectUri;
  const tranCtx = data.tranCtx || data.tranctx || (data.response && data.response.tranCtx);

  if (!redirectURI || !tranCtx) {
    logger.warn('PayPhi initiate: missing redirectURI or tranCtx', { responseCode: code, data });
  } else {
    logger.info('PayPhi initiate OK', { responseCode: code, tranCtx });
  }

  return data;
}

async function command({
  merchantID = MERCHANT_ID,
  merchantTxnNo,
  originalTxnNo,
  transactionType,
  amount,
  // include aggregatorID if you use it (non-empty will be hashed)
  aggregatorID,
  ...rest
}) {
  const formObj = {
    merchantID,
    merchantTxnNo,
    originalTxnNo,
    transactionType,
    amount, // include if non-empty
    aggregatorID, // include if non-empty
    ...rest,
  };

  formObj.secureHash = computeCommandHash(formObj);

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(formObj)) {
    if (v !== null && v !== undefined && String(v) !== '') {
      body.append(k, String(v));
    }
  }

  const resp = await http.post('/command', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return resp.data;
}

function isSuccessStatus(resp) {
  const code = String(resp?.responseCode || resp?.respCode || '').toUpperCase();
  const status = String(resp?.transactionStatus || resp?.status || '').toUpperCase();
  return code === 'R1000' || code === 'SUCCESS' || code === '000' || status === 'SUCCESS' || status === 'CAPTURED';
}

module.exports = {
  BASE,
  formatTxnDate,

  // Canonical/hmac helpers
  buildCanonicalConcatString,
  computeInitiateHash,
  computeCommandHash,
  buildRedirectUrl,

  // API calls
  initiateSale,
  command,
  isSuccessStatus,
};