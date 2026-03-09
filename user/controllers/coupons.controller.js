const couponService = require('../../services/couponService');

// GET /api/coupons
exports.listCoupons = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;
    const active = req.query.active === undefined ? true : !!req.query.active;
    const date = req.query.date || null;
    const attraction_id = req.query.attraction_id ? Number(req.query.attraction_id) : null;
    const q = (req.query.q || '').toString().trim();

    const data = await couponService.list({ active, date, attraction_id, q, limit, offset });
    res.json({ data, meta: { page, limit, count: data.length } });
  } catch (err) {
    next(err);
  }
};

// GET /api/coupons/:code
exports.getCouponByCode = async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim();
    const onDate = req.query.onDate || null;
    const attraction_id = req.query.attraction_id ? Number(req.query.attraction_id) : null;
    const row = await couponService.getByCode(code, { activeOnly: true, onDate, attraction_id });

    if (!row) return res.status(404).json({ error: 'Coupon not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

// POST /api/coupons/apply
exports.applyCoupon = async (req, res, next) => {
  try {
    const { code, items, onDate = null } = req.body || {};
    if (!code || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'code and items array are required' });
    }
    const out = await couponService.applyCoupon({ code, items, onDate });
    res.json(out);
  } catch (err) {
    next(err);
  }
};