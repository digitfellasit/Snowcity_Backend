const express = require('express');
const router = express.Router();

const mediaModel = require('../models/mediaFiles.model');

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    const media = await mediaModel.getMediaById(id);
    if (!media) return res.status(404).json({ error: 'Not found' });
    res.json({
      media_id: media.media_id,
      url: media.url_path,
      path: media.relative_path,
      filename: media.filename,
      size: media.size,
      mimetype: media.mimetype,
      folder: media.folder,
      created_at: media.created_at,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/raw', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
    const media = await mediaModel.getMediaById(id);
    if (!media) return res.status(404).json({ error: 'Not found' });
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.redirect(301, media.url_path);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
