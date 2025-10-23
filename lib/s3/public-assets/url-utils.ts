import { getBucketName, getCdnUrl } from './client';

/**
 * Convert an S3 key to a public CloudFront URL
 *
 * @param s3Key - S3 key (path within bucket)
 * @returns Full CloudFront URL
 *
 * @example
 * getPublicUrl('practices/123/logo/logo_xyz.jpg')
 * // => 'https://cdn.bendcare.com/practices/123/logo/logo_xyz.jpg'
 *
 * @example
 * getPublicUrl('users/user-uuid/avatar/profile_abc.png')
 * // => 'https://cdn.bendcare.com/users/user-uuid/avatar/profile_abc.png'
 */
export function getPublicUrl(s3Key: string): string {
  const cdnUrl = getCdnUrl();
  // Ensure no double slashes
  const cleanKey = s3Key.startsWith('/') ? s3Key.slice(1) : s3Key;
  const cleanCdnUrl = cdnUrl.endsWith('/') ? cdnUrl.slice(0, -1) : cdnUrl;
  return `${cleanCdnUrl}/${cleanKey}`;
}

/**
 * Extract S3 key from a CloudFront or S3 URL
 * Useful for migrations and URL parsing
 *
 * @param url - Full CloudFront URL or S3 URL
 * @returns S3 key or null if not a valid S3/CloudFront URL
 *
 * @example
 * extractS3Key('https://cdn.bendcare.com/practices/123/logo/logo_xyz.jpg')
 * // => 'practices/123/logo/logo_xyz.jpg'
 *
 * @example
 * extractS3Key('https://bcos-public-xxx.s3.amazonaws.com/practices/123/logo.jpg')
 * // => 'practices/123/logo.jpg'
 *
 * @example
 * extractS3Key('https://example.com/not-s3-url.jpg')
 * // => null
 *
 * @example
 * extractS3Key('/local/uploads/file.jpg')
 * // => null
 */
export function extractS3Key(url: string): string | null {
  try {
    const cdnUrl = getCdnUrl();
    const bucket = getBucketName();

    // Try CloudFront URL
    if (url.startsWith(cdnUrl)) {
      const key = url.replace(cdnUrl, '').replace(/^\//, '');
      return key || null;
    }

    // Try S3 direct URL patterns
    const s3Patterns = [
      new RegExp(`https://${bucket}\\.s3\\.amazonaws\\.com/(.+)`),
      new RegExp(`https://${bucket}\\.s3\\.[a-z0-9-]+\\.amazonaws\\.com/(.+)`),
      new RegExp(`https://s3\\.amazonaws\\.com/${bucket}/(.+)`),
      new RegExp(`https://s3\\.[a-z0-9-]+\\.amazonaws\\.com/${bucket}/(.+)`),
    ];

    for (const pattern of s3Patterns) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    }

    return null;
  } catch {
    // If getCdnUrl or getBucketName throws (not configured), return null
    return null;
  }
}

/**
 * Check if a URL is a CloudFront URL
 *
 * @param url - URL to check
 * @returns True if URL is a CloudFront URL
 *
 * @example
 * isCloudFrontUrl('https://cdn.bendcare.com/practices/123/logo.jpg')
 * // => true
 *
 * @example
 * isCloudFrontUrl('/uploads/logo.jpg')
 * // => false
 */
export function isCloudFrontUrl(url: string): boolean {
  try {
    const cdnUrl = getCdnUrl();
    return url.startsWith(cdnUrl);
  } catch {
    return false;
  }
}

/**
 * Check if a URL is a local uploads URL
 *
 * @param url - URL to check
 * @returns True if URL is a local uploads URL
 *
 * @example
 * isLocalUrl('/uploads/practices/logo.jpg')
 * // => true
 *
 * @example
 * isLocalUrl('https://cdn.bendcare.com/practices/123/logo.jpg')
 * // => false
 */
export function isLocalUrl(url: string): boolean {
  return url.startsWith('/uploads/') || url.startsWith('uploads/');
}
