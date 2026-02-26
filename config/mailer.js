const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const logger = require('./logger');

// Zeptomail configuration
const ZEPTO_URL = process.env.ZEPTOMAIL_URL || 'https://api.zeptomail.com/v1.1/email';
const ZEPTO_TOKEN = process.env.ZEPTOMAIL_TOKEN || process.env.ZEPTOMAIL_API_KEY || null;
const MAIL_FROM = process.env.MAIL_FROM || process.env.MAIL_FROM_ADDRESS || 'noreply@snowcityblr.com';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'SnowCity';

// SMTP configuration (Nodemailer)
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;

let zeptoClient = null;
let smtpTransporter = null;

// Initialize Zeptomail if token is present
try {
  if (ZEPTO_TOKEN) {
    const { SendMailClient } = require('zeptomail');
    zeptoClient = new SendMailClient({ url: ZEPTO_URL, token: ZEPTO_TOKEN });
    logger.info('Zeptomail client configured');
  }
} catch (err) {
  logger.warn('Zeptomail SDK initialization failed or not installed');
}

// Initialize Nodemailer if SMTP settings are present
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false'
    }
  });
  logger.info('SMTP transporter configured (Nodemailer)');
}

if (!zeptoClient && !smtpTransporter) {
  logger.error('No email service configured (Zeptomail or SMTP). Email sending will fail.');
}

async function buildAttachments(attachments = []) {
  const out = [];
  for (const a of attachments || []) {
    try {
      if (a.path && fs.existsSync(a.path)) {
        const buffer = fs.readFileSync(a.path);
        out.push({
          filename: a.filename || path.basename(a.path),
          content: buffer,
          contentType: a.contentType || 'application/octet-stream'
        });
      } else if (a.content && a.filename) {
        out.push({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType || 'application/octet-stream'
        });
      }
    } catch (e) {
      logger.warn('Failed to prepare attachment', { err: e.message, attachment: a.filename || a.path });
    }
  }
  return out;
}

async function sendMail({ to, subject, html, text, attachments = [] }) {
  const preparedAttachments = await buildAttachments(attachments);
  const toEmail = Array.isArray(to) ? to[0] : to; // Simplify for unified handling if needed

  // Try Zeptomail first if configured
  if (zeptoClient) {
    try {
      const toList = Array.isArray(to)
        ? to.map(t => ({ email_address: { address: String(t) } }))
        : [{ email_address: { address: String(to) } }];

      const payload = {
        from: { address: MAIL_FROM, name: MAIL_FROM_NAME },
        to: toList,
        subject: subject || '',
        htmlbody: html || (text ? `<pre>${text}</pre>` : ''),
        attachments: preparedAttachments.map(a => ({
          name: a.filename,
          content: a.content.toString('base64'),
          mime_type: a.contentType
        }))
      };

      const resp = await zeptoClient.sendMail(payload);
      logger.info('Email sent via Zeptomail', { to, subject });
      return resp;
    } catch (err) {
      logger.error('Zeptomail failed, falling back to SMTP if available', { err: err.message });
      if (!smtpTransporter) throw err;
    }
  }

  // Fallback or Primary: SMTP (Nodemailer)
  if (smtpTransporter) {
    try {
      const mailOptions = {
        from: `"${MAIL_FROM_NAME}" <${MAIL_FROM}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject: subject || '',
        text: text || '',
        html: html || '',
        attachments: preparedAttachments.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType
        }))
      };

      const info = await smtpTransporter.sendMail(mailOptions);
      logger.info('Email sent via SMTP', { to, subject, messageId: info.messageId });
      return info;
    } catch (err) {
      logger.error('SMTP sendMail failed', { err: err.message });
      throw err;
    }
  }

  throw new Error('No email service configured to handle the request');
}

module.exports = {
  sendMail,
};