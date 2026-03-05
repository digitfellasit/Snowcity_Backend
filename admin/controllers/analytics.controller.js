const analyticsModel = require('../../models/analytics.model');
const adminModel = require('../models/admin.model');
const { buildScopeFilter } = require('../middleware/scopedAccess');

// Combined overview: summary + breakdown + top attractions + trend (uses live bookings)
exports.getOverview = async (req, res, next) => {
  try {
    const { from = null, to = null } = req.query;
    // Apply attraction scope if not full access
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const attractionId = attractionScope.includes('*') ? null : (attractionScope.length ? attractionScope[0] : null);
    const data = await adminModel.getAdminOverview({ from, to, attraction_id: attractionId });

    // Fallback to analytics aggregate if admin overview returns nothing
    if (!data || !data.summary) {
      const [summary, topAttractions, trend] = await Promise.all([
        analyticsModel.getSummary({ from, to }),
        adminModel.getTopAttractions({ from, to, limit: 5, attraction_id: attractionId }),
        adminModel.getSalesTrend({ from, to, granularity: 'day', attraction_id: attractionId }),
      ]);
      return res.json({ summary, topAttractions, trend, statusBreakdown: [] });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
};

// Raw analytics series per attraction/date window
exports.getAnalytics = async (req, res, next) => {
  try {
    // Apply attraction scope
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const attractionId = attractionScope.includes('*') ? null : (attractionScope.length ? attractionScope[0] : null);
    const { from = null, to = null } = req.query;
    const data = await analyticsModel.getAnalytics({ attraction_id: attractionId, from, to });
    res.json({ data, meta: { count: data.length } });
  } catch (err) {
    next(err);
  }
};

// Sales trend grouped by granularity
exports.getTrend = async (req, res, next) => {
  try {
    const { from = null, to = null, granularity = 'day' } = req.query;
    // Apply attraction scope
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const attractionId = attractionScope.includes('*') ? null : (attractionScope.length ? attractionScope[0] : null);
    const data = await adminModel.getSalesTrend({ from, to, granularity, attraction_id: attractionId });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// Top attractions by bookings/revenue
exports.getTopAttractions = async (req, res, next) => {
  try {
    const { from = null, to = null } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    // Apply attraction scope
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const attractionId = attractionScope.includes('*') ? null : (attractionScope.length ? attractionScope[0] : null);
    const data = await adminModel.getTopAttractions({ from, to, limit, attraction_id: attractionId });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// Operations Dashboard specific data
exports.getOpsDashboard = async (req, res, next) => {
  try {
    const { from = null, to = null } = req.query;
    // We are currently ignoring scopes for Ops Dashboard specifically since it's a global counter overview
    const data = await adminModel.getOpsDashboardStats({ from, to });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// Transaction Report
exports.getTransactionReport = async (req, res, next) => {
  try {
    const { from = null, to = null, type = 'both' } = req.query;
    const data = await adminModel.getTransactionReport({ from, to, type });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// Guest Report
exports.getGuestReport = async (req, res, next) => {
  try {
    const { from = null, to = null } = req.query;
    const data = await adminModel.getGuestReport({ from, to });
    res.json(data);
  } catch (err) {
    next(err);
  }
};