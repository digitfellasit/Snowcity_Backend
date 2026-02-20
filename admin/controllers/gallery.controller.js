const galleryModel = require('../../models/gallery.model');
const { buildScopeFilter } = require('../middleware/scopedAccess');

exports.list = async (req, res, next) => {
  try {
    const active = req.query.active === undefined ? null : String(req.query.active).toLowerCase() === 'true';
    const q = (req.query.q || '').toString().trim();
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;
    const target_type = (req.query.target_type || '').toString().trim() || null;
    const target_ref_id = req.query.target_ref_id !== undefined && req.query.target_ref_id !== ''
      ? Number(req.query.target_ref_id)
      : null;

    // Scope: only return gallery items this admin can access
    const scopes = req.user.scopes || {};
    const galleryScope = scopes.gallery || [];
    if (!galleryScope.includes('*')) {
      // If no full access, enforce list filter
      const scopedIds = galleryScope.length ? galleryScope : [null];
      const data = await galleryModel.list({ active, q, target_type, target_ref_id, limit, offset, galleryIds: scopedIds });
      return res.json({ data, meta: { page, limit, count: data.length } });
    }

    const data = await galleryModel.list({ active, q, target_type, target_ref_id, limit, offset });
    res.json({ data, meta: { page, limit, count: data.length } });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid gallery id' });
    const scopes = req.user.scopes || {};
    const galleryScope = scopes.gallery || [];
    if (galleryScope.length && !galleryScope.includes('*') && !galleryScope.includes(id)) {
      return res.status(403).json({ error: 'Forbidden: gallery item not in scope' });
    }
    const row = await galleryModel.getById(id);
    if (!row) return res.status(404).json({ error: 'Gallery item not found' });
    res.json(row);
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    // Scope: only admins with full gallery module access can create
    const scopes = req.user.scopes || {};
    const galleryScope = scopes.gallery || [];
    if (!galleryScope.includes('*')) {
      return res.status(403).json({ error: 'Forbidden: requires full gallery module access' });
    }
    const {
      media_type,
      url,
      image_alt = null,
      title = null,
      description = null,
      active = true,
      target_type = 'none',
      target_ref_id = null,
    } = req.body || {};
    if (!media_type || !url) return res.status(400).json({ error: 'media_type and url are required' });
    const row = await galleryModel.create({ media_type, url, image_alt, title, description, active, target_type, target_ref_id });
    res.status(201).json(row);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid gallery id' });
    const scopes = req.user.scopes || {};
    const galleryScope = scopes.gallery || [];
    if (galleryScope.length && !galleryScope.includes('*') && !galleryScope.includes(id)) {
      return res.status(403).json({ error: 'Forbidden: gallery item not in scope' });
    }
    const row = await galleryModel.update(id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Gallery item not found' });
    res.json(row);
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid gallery id' });
    const scopes = req.user.scopes || {};
    const galleryScope = scopes.gallery || [];
    if (galleryScope.length && !galleryScope.includes('*') && !galleryScope.includes(id)) {
      return res.status(403).json({ error: 'Forbidden: gallery item not in scope' });
    }
    const ok = await galleryModel.remove(id);
    if (!ok) return res.status(404).json({ error: 'Gallery item not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
};

exports.bulkDelete = async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    // Validate all IDs
    const validIds = ids.filter(id => Number.isFinite(Number(id))).map(id => Number(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid IDs provided' });
    }

    // Scope: only admins with full gallery module access can bulk delete
    const scopes = req.user.scopes || {};
    const galleryScope = scopes.gallery || [];
    if (!galleryScope.includes('*')) {
      return res.status(403).json({ error: 'Forbidden: requires full gallery module access' });
    }

    const results = await galleryModel.bulkDelete(validIds);
    res.json({ deleted: results.deletedCount, count: results.deletedCount });
  } catch (err) { next(err); }
};
