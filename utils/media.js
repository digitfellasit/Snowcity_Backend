const CLOUDFRONT = process.env.CLOUDFRONT_DOMAIN;
const S3_SUFFIX = '.s3.ap-south-1.amazonaws.com';

/**
 * Transforms an S3 URL into a CloudFront URL if CLOUDFRONT_DOMAIN is set.
 * @param {string} url 
 * @returns {string}
 */
function toCdn(url) {
  if (!url || typeof url !== 'string' || !CLOUDFRONT) return url;
  
  // If the URL contains an S3 domain, replace the S3 part with the CloudFront domain.
  // The S3 domain format is typically {bucket}.s3.{region}.amazonaws.com
  if (url.includes(S3_SUFFIX)) {
    // Find the part to replace: from the start of the bucket name to the end of the S3 suffix
    // Example: https://snowparkblr.s3.ap-south-1.amazonaws.com/path/to/image.jpg
    try {
      const u = new URL(url);
      if (u.hostname.endsWith(S3_SUFFIX)) {
        u.hostname = CLOUDFRONT;
        return u.toString();
      }
    } catch (e) {
      // Fallback to simple replace if URL parsing fails
      return url.replace(/[^/]+\.s3\.ap-south-1\.amazonaws\.com/, CLOUDFRONT);
    }
  }
  
  return url;
}

module.exports = {
  toCdn
};
