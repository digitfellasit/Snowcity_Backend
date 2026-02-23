const logger = require('../../config/logger');
const { saveToS3, saveToLocal } = require('../../utils/uploader');
const mediaModel = require('../../models/mediaFiles.model');

function parseBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return defaultValue;
}

/**
 * Determine if S3 is configured and should be used.
 */
function useS3() {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.S3_BUCKET);
}

/**
 * Upload a single file – to S3 if configured, otherwise local fallback.
 */
async function uploadFile(file, { folder, optimize }) {
  if (useS3()) {
    const s3Result = await saveToS3(file, { folder: folder || 'uploads', optimize });
    return {
      urlPath: s3Result.url,
      relativePath: s3Result.key,
      filename: s3Result.key.split('/').pop(),
      size: file.size || file.buffer?.length || 0,
      mimetype: file.mimetype,
      folder: folder || '',
    };
  }
  // Fallback to local storage
  return saveToLocal(file, { folder, optimize });
}

exports.uploadSingleImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const folder = req.body?.folder || req.query?.folder || '';
    const optimize = parseBoolean(req.body?.optimize ?? req.query?.optimize, true);

    logger.debug('Admin upload incoming', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      folder,
      optimize,
      storage: useS3() ? 's3' : 'local',
    });

    const result = await uploadFile(req.file, { folder, optimize });

    const media = await mediaModel.createMedia({
      url_path: result.urlPath,
      relative_path: result.relativePath,
      filename: result.filename,
      size: result.size,
      mimetype: result.mimetype,
      folder: result.folder,
    });

    return res.status(201).json({
      media_id: media?.media_id,
      url: result.urlPath,
      url_path: result.urlPath,
      path: result.relativePath,
      filename: result.filename,
      size: result.size,
      mimetype: result.mimetype,
      folder: result.folder,
    });
  } catch (error) {
    logger.error('Failed to handle admin upload', {
      message: error.message,
      stack: error.stack,
    });
    return next(error);
  }
};

exports.uploadBulkImages = async (req, res, next) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const folder = req.body?.folder || '';
    const optimize = parseBoolean(req.body?.optimize, true);

    logger.debug('Admin bulk upload incoming', {
      count: req.files.length,
      folder,
      optimize,
      storage: useS3() ? 's3' : 'local',
    });

    const results = [];
    for (const file of req.files) {
      try {
        const result = await uploadFile(file, { folder, optimize });
        const media = await mediaModel.createMedia({
          url_path: result.urlPath,
          relative_path: result.relativePath,
          filename: result.filename,
          size: result.size,
          mimetype: result.mimetype,
          folder: result.folder,
        });
        results.push({
          media_id: media?.media_id,
          url: result.urlPath,
          url_path: result.urlPath,
          path: result.relativePath,
          filename: result.filename,
          size: result.size,
          mimetype: result.mimetype,
          folder: result.folder,
        });
      } catch (fileError) {
        logger.error('Failed to upload file', { filename: file.originalname, error: fileError.message });
        // Continue with other files
      }
    }

    return res.status(201).json({
      urls: results.map(r => r.url),
      files: results,
    });
  } catch (error) {
    logger.error('Failed to handle admin bulk upload', {
      message: error.message,
      stack: error.stack,
    });
    return next(error);
  }
};
