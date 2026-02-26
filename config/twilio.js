/**
 * SMS Service — TextLocal (text.messagewall.in) API
 * Replaces Twilio for OTP delivery.
 */
const logger = require('./logger');

const SMS_API_KEY = process.env.TEXTLOCAL_API_KEY || '';
const SMS_SENDER = process.env.TEXTLOCAL_SENDER || 'THEMSG';
const SMS_ROUTE = process.env.TEXTLOCAL_ROUTE || '2';
const SMS_TEMPLATE_ID = process.env.TEXTLOCAL_TEMPLATE_ID || '';
const SMS_BASE_URL = process.env.TEXTLOCAL_BASE_URL || 'http://text.messagewall.in/api/smsapi';

if (!SMS_API_KEY) {
  logger.warn('TextLocal SMS API key not configured — SMS delivery will fail.');
}

/**
 * Send SMS via TextLocal HTTP API.
 * @param {{ to: string, body: string }} options
 */
async function sendSMS({ to, body }) {
  if (!SMS_API_KEY) throw new Error('SMS not configured — TEXTLOCAL_API_KEY missing');

  // Normalise to 10-digit number (remove any non-digits and take last 10)
  let number = String(to).replace(/\D/g, '').slice(-10);

  const params = new URLSearchParams({
    key: SMS_API_KEY,
    route: SMS_ROUTE,
    sender: SMS_SENDER,
    number,
    sms: body,
  });

  if (SMS_TEMPLATE_ID) params.set('templateid', SMS_TEMPLATE_ID);

  const url = `${SMS_BASE_URL}?${params.toString()}`;
  logger.info('TextLocal SMS request', { to: number, url: url.replace(SMS_API_KEY, '***') });

  try {
    const res = await fetch(url);
    const text = await res.text();
    logger.info('TextLocal SMS response', { to: number, status: res.status, response: text.slice(0, 300) });
    if (text.includes('error') || text.includes('ERROR')) {
      logger.error('TextLocal SMS error response', { response: text });
    }
    return { success: true, response: text };
  } catch (err) {
    logger.error('TextLocal SMS failed', { to: number, error: err.message });
    throw err;
  }
}

/**
 * sendWhatsApp — stub. WhatsApp is handled via Interakt, not TextLocal.
 */
async function sendWhatsApp({ to, body }) {
  logger.warn('sendWhatsApp via TextLocal not supported; use Interakt service instead.', { to });
  return { success: false, reason: 'Use Interakt for WhatsApp' };
}

module.exports = {
  client: null,
  sendSMS,
  sendWhatsApp,
};