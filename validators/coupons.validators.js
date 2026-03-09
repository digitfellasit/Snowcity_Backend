const { body, param, query } = require('express-validator');

const createCouponValidator = [
  body('code').isLength({ min: 2, max: 50 }).trim(),
  body('description').optional({ nullable: true }).isString(),
  body('type').isIn(['flat', 'percent', 'bogo', 'specific']),
  body('value').isFloat({ min: 0 }).toFloat(),
  body('attraction_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body('min_amount').optional().isFloat({ min: 0 }).toFloat(),
  body('valid_from').isISO8601().withMessage('valid_from must be date'),
  body('valid_to')
    .isISO8601()
    .withMessage('valid_to must be date')
    .custom((v, { req }) => {
      if (new Date(v) < new Date(req.body.valid_from)) throw new Error('valid_to must be on/after valid_from');
      return true;
    }),
  body('active').optional().isBoolean().toBoolean(),
];

const updateCouponValidator = [
  param('id').isInt({ min: 1 }).toInt(),
  ...createCouponValidator.map((r) => r.optional({ nullable: true })),
];

const listCouponsQuery = [
  query('active').optional().isBoolean().toBoolean(),
  query('attraction_id').optional().isInt({ min: 1 }).toInt(),
  query('date').optional().isISO8601(),
  query('q').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const getCouponByCodeParam = [param('code').isString().trim().isLength({ min: 1, max: 50 })];

const applyCouponBody = [
  body('code').isString().trim().isLength({ min: 1, max: 50 }),
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.item_type').optional().isString(),
  body('items.*.attraction_id').optional({ nullable: true }).isInt(),
  body('items.*.combo_id').optional({ nullable: true }).isInt(),
  body('items.*.price').isFloat({ min: 0 }).toFloat(),
  body('items.*.quantity').isInt({ min: 1 }).toInt(),
  body('onDate').optional().isISO8601(),
];

module.exports = {
  createCouponValidator,
  updateCouponValidator,
  listCouponsQuery,
  getCouponByCodeParam,
  applyCouponBody,
};