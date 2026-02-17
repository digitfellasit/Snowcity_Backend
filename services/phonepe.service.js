const axios = require('axios');

class PhonePeService {
  constructor() {
    this.baseUrl = process.env.PHONEPE_ENVIRONMENT === 'production'
      ? process.env.PHONEPE_BASE_URL_PRODUCTION
      : process.env.PHONEPE_BASE_URL_SANDBOX;

    this.clientId = process.env.PHONEPE_CLIENT_ID;
    this.clientSecret = process.env.PHONEPE_CLIENT_SECRET;
    this.clientVersion = process.env.PHONEPE_CLIENT_VERSION || '1.0.0';

    // Token cache
    this.tokenCache = {
      accessToken: null,
      expiresAt: null,
      issuedAt: null
    };
  }

  /**
   * Get OAuth2 access token for PhonePe API
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    try {
      // Check if we have a valid cached token
      if (this.tokenCache.accessToken && this.tokenCache.expiresAt) {
        const now = Date.now();
        const expiresAt = new Date(this.tokenCache.expiresAt * 1000);

        // Add 5 minute buffer before expiration
        if (expiresAt.getTime() > (now + 5 * 60 * 1000)) {
          return this.tokenCache.accessToken;
        }
      }

      console.log('🔑 Getting new PhonePe access token...');

      const tokenUrl = `${this.baseUrl}/apis/pg-sandbox/v1/oauth/token`;

      const response = await axios.post(tokenUrl, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        client_version: this.clientVersion,
        grant_type: 'client_credentials'
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data && response.data.access_token) {
        // Cache the token
        this.tokenCache = {
          accessToken: response.data.access_token,
          expiresAt: response.data.expires_at,
          issuedAt: response.data.issued_at,
          tokenType: response.data.token_type
        };

        console.log('✅ PhonePe access token obtained successfully');
        return this.tokenCache.accessToken;
      } else {
        throw new Error('Invalid token response from PhonePe');
      }

    } catch (error) {
      console.error('❌ Failed to get PhonePe access token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with PhonePe');
    }
  }

  /**
   * Make authenticated request to PhonePe API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request data
   * @returns {Promise<object>} Response data
   */
  async makeAuthenticatedRequest(method, endpoint, data = null) {
    try {
      const accessToken = await this.getAccessToken();
      const url = `${this.baseUrl}${endpoint}`;

      const config = {
        method: method.toUpperCase(),
        url,
        headers: {
          'Authorization': `O-Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
        config.data = data;
      } else if (data && (method.toUpperCase() === 'GET' || method.toUpperCase() === 'DELETE')) {
        config.params = data;
      }

      const response = await axios(config);

      return {
        success: true,
        data: response.data,
        status: response.status
      };

    } catch (error) {
      console.error(`❌ PhonePe API ${method} ${endpoint} failed:`, error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data || error.message,
        status: error.response?.status || 500
      };
    }
  }

  /**
   * Create a payment request with PhonePe
   * @param {object} paymentData - Payment details
   * @returns {Promise<object>} Payment creation response
   */
  async createPayment(paymentData) {
    const payload = {
      merchantOrderId: paymentData.merchantOrderId,
      amount: paymentData.amount,
      metaInfo: {
        udf1: paymentData.udf1 || '',
        udf2: paymentData.udf2 || '',
        udf3: paymentData.udf3 || '',
        udf4: paymentData.udf4 || '',
        udf5: paymentData.udf5 || ''
      },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: paymentData.message || 'Complete your payment',
        merchantUrls: {
          redirectUrl: paymentData.redirectUrl
        },
        paymentModeConfig: paymentData.paymentModeConfig || {}
      }
    };

    console.log('💳 Creating PhonePe payment:', { merchantOrderId: paymentData.merchantOrderId, amount: paymentData.amount });

    const response = await this.makeAuthenticatedRequest('POST', '/apis/pg-sandbox/v1/pay', payload);

    if (response.success) {
      console.log('✅ PhonePe payment created successfully');
      return {
        success: true,
        data: response.data,
        redirectUrl: response.data?.data?.instrumentResponse?.redirectInfo?.url,
        merchantTransactionId: response.data?.data?.merchantTransactionId
      };
    } else {
      console.error('❌ PhonePe payment creation failed:', response.error);
      return {
        success: false,
        error: response.error
      };
    }
  }

  /**
   * Check payment status
   * @param {string} merchantOrderId - Order ID to check
   * @returns {Promise<object>} Payment status response
   */
  async checkPaymentStatus(merchantOrderId) {
    console.log('🔍 Checking PhonePe payment status for:', merchantOrderId);

    const response = await this.makeAuthenticatedRequest('GET', `/apis/pg-sandbox/v1/order/${merchantOrderId}/status`);

    if (response.success) {
      console.log('✅ PhonePe payment status retrieved');
      return {
        success: true,
        data: response.data,
        status: this.mapPaymentStatus(response.data?.data?.state)
      };
    } else {
      console.error('❌ PhonePe payment status check failed:', response.error);
      return {
        success: false,
        error: response.error
      };
    }
  }

  /**
   * Map PhonePe payment states to standardized status
   * @param {string} phonePeState - PhonePe payment state
   * @returns {string} Standardized status
   */
  mapPaymentStatus(phonePeState) {
    const statusMap = {
      'PAYMENT_INITIATED': 'initiated',
      'PAYMENT_SUCCESS': 'completed',
      'PAYMENT_FAILED': 'failed',
      'PAYMENT_CANCELLED': 'cancelled',
      'PAYMENT_PENDING': 'pending'
    };

    return statusMap[phonePeState] || 'unknown';
  }
}

module.exports = new PhonePeService();
