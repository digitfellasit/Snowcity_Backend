const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const fs = require('fs');

const REGION = process.env.AWS_REGION || 'ap-south-1';
const BUCKET = process.env.S3_BUCKET;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const CLOUDFRONT = process.env.CLOUDFRONT_DOMAIN;
const S3_DOMAIN = `${BUCKET}.s3.${REGION}.amazonaws.com`;

function getPublicUrl(key) {
  const url = `https://${S3_DOMAIN}/${encodeURI(key)}`;
  if (CLOUDFRONT) {
    return url.replace(S3_DOMAIN, CLOUDFRONT);
  }
  return url;
}

/**
 * Upload buffer (multer memory storage)
 */
async function uploadBuffer({ buffer, key, contentType = 'application/octet-stream' }) {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    },
  });

  await upload.done();

  return {
    key,
    bucket: BUCKET,
    location: getPublicUrl(key),
  };
}

/**
 * Upload file from disk
 */
async function uploadFile({ filePath, key, contentType }) {
  const fileKey = key || path.basename(filePath);

  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileKey,
    Body: fs.createReadStream(filePath),
    ContentType: contentType,
  });

  await s3.send(cmd);

  return {
    key: fileKey,
    bucket: BUCKET,
    location: getPublicUrl(fileKey),
  };
}

/**
 * Delete object
 */
async function removeObject(key) {
  const cmd = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return s3.send(cmd);
}

/**
 * Get signed URL for private bucket
 */
async function getSignedObjectUrl(key, expiresIn = 900) {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(s3, cmd, { expiresIn });
}

module.exports = {
  s3,
  uploadBuffer,
  uploadFile,
  removeObject,
  getSignedObjectUrl,
  getPublicUrl,
  BUCKET,
  REGION,
};