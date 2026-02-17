const express = require('express');
const router = express.Router();

const payphiReturn = require('../webhooks/payphi.return');
const phonepeReturn = require('../webhooks/phonepe.return');
const phonepeNotify = require('../webhooks/phonepe.notify');
const interaktWebhook = require('../webhooks/interakt.webhook');

router.get('/payphi/return', payphiReturn);
router.post('/payphi/return', payphiReturn);

router.get('/phonepe/return', phonepeReturn);
router.post('/phonepe/return', phonepeReturn);
router.post('/phonepe/notify', phonepeNotify);

// Interakt WhatsApp webhook
router.post('/interakt', interaktWebhook);

module.exports = router;