const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const hpp = require('hpp');
const morgan = require('morgan');

const logger = require('./config/logger');
const corsOptions = require('./config/cors');

const app = express();

// Trust proxy (for rate limiting, IP, secure cookies if behind proxy)
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

// Body parsers — ONCE, EARLY!
app.use(express.json({ limit: process.env.MAX_JSON_SIZE || '2mb' }));
app.use(express.urlencoded({ limit: process.env.MAX_URLENCODED_SIZE || '2mb', extended: true }));

// Security & CORS — EARLY (BEFORE ROUTES!)
app.use(helmet());
app.use(compression());
app.use(hpp());
app.use(cors(corsOptions)); // ← FIXED: BEFORE ROUTES!

// Serve uploaded assets with aggressive caching (images rarely change)
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    next();
  },
  express.static(path.resolve(__dirname, 'uploads'))
);

// HTTP logging via morgan -> winston
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
  })
);

// Routes — AFTER CORS!
const apiRoutes = require('./routes');
const webhookRoutes = require('./routes/webhooks.routes');
app.use('/api', apiRoutes);
app.use('/webhooks', webhookRoutes);

// SSR routes for SEO crawlers (full HTML rendering)
app.use('/', require('./routes/ssr.routes'));

// Echo endpoint
app.post('/_echo', (req, res) => {
  res.json({ body: req.body, headers: req.headers });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});



// 404
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
  });

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

const cron = require('node-cron');
const { pool } = require('./config/db');

// Run every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    console.log('Running cleanup: Abandoned Pending Orders...');

    // Delete orders pending for more than 20 minutes
    // Cascading delete will remove associated bookings and booking_addons
    const res = await pool.query(
      `DELETE FROM orders 
       WHERE payment_status = 'Pending' 
       AND created_at < NOW() - INTERVAL '20 minutes'`
    );

    if (res.rowCount > 0) {
      console.log(`Cleanup: Removed ${res.rowCount} abandoned orders.`);
    }
  } catch (err) {
    console.error('Cleanup Error:', err);
  }
});

module.exports = app;