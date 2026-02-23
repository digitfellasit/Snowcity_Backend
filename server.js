/* eslint-disable no-console */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const http = require('http');
const app = require('./app');
const logger = require('./config/logger');
const { pool } = require('./config/db');
const initService = require('./services/initService');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

app.use('/api/webhooks', require('./webhooks/payphi.return'));


// Start server only after confirming DB connectivity
async function start() {
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        "select current_database() as db, current_user as user_name, current_setting('TimeZone') as tz"
      );
      const r = rows?.[0] || {};
      const sslEnabled = !!(pool.options && pool.options.ssl);
      const poolMax = pool.options?.max;

      logger.info('PostgreSQL connected', {
        database: r.db,
        user: r.user_name,
        ssl: sslEnabled,
        poolMax,
        timezone: r.tz || 'UTC',
      });

      // Initialize system with Super Admin and Permissions
      await initService.initializeSystem();
    } finally {
      client.release();
    }
  } catch (err) {
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error('Failed to connect to PostgreSQL', { err: err.message });
    } else {
      console.error('Failed to connect to PostgreSQL:', err.message);
    }
    process.exit(1);
  }

  server.listen(PORT, () => {
    logger.info(
      `SnowCity API running on http://localhost:${PORT} (env: ${process.env.NODE_ENV || 'development'})`
    );
  });
}

start();
const shutdown = async (signal) => {
  try {
    logger.warn(`${signal} received. Shutting down gracefully...`);
    server.close(async (err) => {
      if (err) {
        logger.error('Error while closing server', { err });
        process.exitCode = 1;
      }
      try {
        await pool.end();
        logger.info('PostgreSQL pool closed.');
      } catch (dbErr) {
        logger.error('Error while closing PG pool', { dbErr });
      } finally {
        process.exit();
      }
    });
  } catch (e) {
    logger.error('Unexpected error during shutdown', { e });
    process.exit(1);
  }
};

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => shutdown(sig));
});

// Catch unhandled
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { err });
  shutdown('uncaughtException');
});