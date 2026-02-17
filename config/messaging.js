"use strict";



const APP_URL = (process.env.APP_URL || 'https://snowcity-backend-zjlj.onrender.com').replace(/\/+$/, '');

const interakt = {
  apiUrl: process.env.INTERAKT_API_URL || process.env.INTERAKT_URL || null,
  apiKey: process.env.INTERAKT_API_KEY || process.env.INTERAKT_TOKEN || null,
  sender: process.env.INTERAKT_SENDER || process.env.WHATSAPP_SENDER || null
};



const email = {
  smtpHost: process.env.SMTP_HOST || null,
  smtpPort: process.env.SMTP_PORT || null,
  user: process.env.SMTP_USER || null,
  pass: process.env.SMTP_PASS || null,
  from: process.env.EMAIL_FROM || 'no-reply@localhost'
};

module.exports = { APP_URL, interakt, email };
