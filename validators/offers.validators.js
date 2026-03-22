const { body, param, query } = require('express-validator');

const createOfferValidator = [
  body('title').isLength({ min: 2, max: 100 }),
  body('description').optional({ nullable: true }).isString(),
  body('image_url').optional({ nullable: true }).isURL(),
  body('rule_type').optional({ nullable: true }).isIn(['holiday', 'happy_hour', 'weekday_special', 'dynamic_pricing', 'date_slot_pricing', 'buy_x_get_y', 'first_n_tickets']),
  body('discount_type').optional().isIn(['percent', 'amount']),
  body('discount_value').optional().isFloat({ min: 0 }).toFloat(),
  body('max_discount').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('valid_from').optional({ nullable: true }).isISO8601(),
  body('valid_to')
    .optional({ nullable: true })
    .isISO8601()
    .custom((v, { req }) => {
      if (v && req.body.valid_from && new Date(v) < new Date(req.body.valid_from))
        throw new Error('valid_to must be on/after valid_from');
      return true;
    }),
  body('active').optional().isBoolean().toBoolean(),
  body('rules').optional().isArray().withMessage('Rules must be an array'),
  body('rules.*.target_type').optional().isIn(['attraction', 'combo']),
  body('rules.*.target_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('rules.*.applies_to_all').optional().isBoolean(),
  body('rules.*.date_from').optional({ nullable: true }).isISO8601(),
  body('rules.*.date_to').optional({ nullable: true }).isISO8601(),
  body('rules.*.time_from').optional({ nullable: true }).matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('rules.*.time_to').optional({ nullable: true }).matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('rules.*.rule_discount_type').optional({ nullable: true }).isIn(['percent', 'amount']),
  body('rules.*.rule_discount_value').optional({ nullable: true }).isFloat({ min: 0 }),
  body('rules.*.priority').optional().isInt({ min: 1 }),
  body('rules.*.ticket_limit').optional({ nullable: true }).isInt({ min: 1 }),
  body('rules.*.offer_price').optional({ nullable: true }).isFloat({ min: 0 }),
];

const updateOfferValidator = [param('id').isInt({ min: 1 }).toInt(), ...createOfferValidator.map((r) => r.optional())];

const listOffersQuery = [
  query('active').optional().isBoolean().toBoolean(),
  query('rule_type').optional().isIn(['holiday', 'happy_hour', 'weekday_special', 'dynamic_pricing', 'date_slot_pricing', 'buy_x_get_y', 'first_n_tickets']),
  query('date').optional().isISO8601(),
  query('q').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  createOfferValidator,
  updateOfferValidator,
  listOffersQuery,
};