const axios = require('axios');
const { nanoid } = require('nanoid');
const logger = require('./logger');

function createHttpClient({ baseURL, timeout = 10000, headers = {} } = {}) {
  const instance = axios.create({
    baseURL,
    timeout,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'SnowCity-Backend/1.0',
      ...headers,
    },
  });

  instance.interceptors.request.use(
    (config) => {
      config.metadata = { start: Date.now() };
      config.headers['X-Request-Id'] = config.headers['X-Request-Id'] || nanoid();
      return config;
    },
    (error) => Promise.reject(error)
  );

  instance.interceptors.response.use(
    (response) => {
      const duration = Date.now() - (response.config.metadata?.start || Date.now());
      logger.debug('HTTP', {
        method: response.config.method,
        url: response.config.url,
        status: response.status,
        duration,
      });
      return response;
    },
    (error) => {
      const config = error.config || {};
      const duration = Date.now() - (config.metadata?.start || Date.now());
      logger.warn('HTTP Error', {
        method: config.method,
        url: config.url,
        status: error.response?.status,
        duration,
        message: error.message,
      });
      return Promise.reject(error);
    }
  );

  return instance;
}

module.exports = createHttpClient;