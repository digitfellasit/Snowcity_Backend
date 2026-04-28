const { body, param, query } = require('express-validator');

function isAllowedImageRef(value) {
  if (value === undefined || value === null || value === '') return true;
  const s = String(value).trim();
  if (!s) return true;
  return (
    /^https?:\/\//i.test(s) ||
    /^\d+$/.test(s) ||
    s.startsWith('/uploads/') ||
    s.startsWith('/api/uploads/') ||
    s.startsWith('/api/parkpanel/uploads/')
  );
}

const createBannerValidator = [
  body('web_image')
    .optional({ nullable: true })
    .custom((v) => isAllowedImageRef(v))
    .withMessage('web_image must be an absolute URL, media id, or upload path'),
  body('mobile_image')
    .optional({ nullable: true })
    .custom((v) => isAllowedImageRef(v))
    .withMessage('mobile_image must be an absolute URL, media id, or upload path'),
  body('title').optional({ nullable: true }).isLength({ min: 0, max: 100 }),
  body('description').optional({ nullable: true }).isString(),
  body('cta_text').optional({ nullable: true }).isLength({ min: 0, max: 100 }),
  body('link_url')
    .optional({ nullable: true })
    .custom((v) => {
      if (v === undefined || v === null || v === '') return true;
      const s = String(v);
      return /^https?:\/\//i.test(s) || s.startsWith('/');
    })
    .withMessage('link_url must be an absolute URL or start with /'),
  body('linked_attraction_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body('linked_offer_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body('active').optional().isBoolean().toBoolean(),
];

const updateBannerValidator = [param('id').isInt({ min: 1 }).toInt(), ...createBannerValidator.map((r) => r.optional())];

const listBannersQuery = [
  query('active').optional().isBoolean().toBoolean(),
  query('attraction_id').optional().isInt({ min: 1 }).toInt(),
  query('offer_id').optional().isInt({ min: 1 }).toInt(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  createBannerValidator,
  updateBannerValidator,
  listBannersQuery,
};
