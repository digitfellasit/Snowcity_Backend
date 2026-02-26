const DEFAULT_ORIGINS = [
  'app.snowcityblr.com',
  'app.snowcityblr.com',
  'app.snowcityblr.com',
  'https://snowcity.vercel.app',
  'http://127.0.0.1:5174',
  'app.snowcityblr.com',
  'https://snowcity.vercel.app',
  'https://qa.phicommerce.com',
  'app.snowcityblr.com'
];

const parseOrigins = () => {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return DEFAULT_ORIGINS;
  const envList = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return Array.from(new Set([...
    DEFAULT_ORIGINS,
  ...envList,
  ]));
};

const allowedOrigins = parseOrigins();

const corsOptions = {
  origin: function (origin, callback) {
    const isDev = process.env.NODE_ENV !== 'production';
    // Allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    // Some flows (payment gateways, file://, about:blank) send literal 'null' Origin
    if (origin === 'null') return callback(null, true);
    // In non-production, allow localhost/127.0.0.1 on any port for dev convenience
    if (isDev && /^(https?:)\/\/(localhost|127\.0\.0\.1)(:\\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: Origin ${origin} not allowed`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Session-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86400,
};

module.exports = corsOptions;
