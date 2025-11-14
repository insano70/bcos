import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { CacheService } from '@/lib/cache/base';
import type { ClinectRating, ClinectReview, ClinectReviews } from '@/lib/types/practice';
import DOMPurify from 'isomorphic-dompurify';

const CLINECT_API_BASE = 'https://api2.clinectsurvey.com/stats';
const CLINECT_GROUP_ID = 'bendcare';
const API_TIMEOUT_MS = 5000;
const CACHE_TTL_RATINGS = 900; // 15 minutes
const CACHE_TTL_REVIEWS = 1800; // 30 minutes

// Response count and score thresholds
const MIN_RESPONSE_COUNT = 1;
const MIN_SCORE_VALUE = 65; // 0-100 scale

/**
 * Sanitize review data from Clinect API
 * Defense-in-depth: Strip all HTML tags and limit lengths
 *
 * @param review - Raw review from Clinect API
 * @returns Sanitized review safe for display
 */
function sanitizeReview(review: ClinectReview): ClinectReview {
  return {
    ...review,
    approved_comment: DOMPurify.sanitize(review.approved_comment, {
      ALLOWED_TAGS: [], // Strip all HTML tags
      ALLOWED_ATTR: [], // Strip all attributes
    }).substring(0, 5000), // Cap at 5000 characters
    patient_name: review.patient_name
      ? DOMPurify.sanitize(review.patient_name, {
          ALLOWED_TAGS: [],
          ALLOWED_ATTR: [],
        }).substring(0, 255) // Cap at 255 characters
      : null,
  };
}

/**
 * Clinect Cache Service
 * Handles caching for Clinect API responses
 */
class ClinectCacheService extends CacheService {
  protected namespace = 'clinect';
  protected defaultTTL = CACHE_TTL_RATINGS;

  async invalidate(practiceSlug?: string): Promise<void> {
    if (practiceSlug) {
      // Invalidate specific practice ratings and reviews
      await this.del(this.buildKey('ratings', practiceSlug));
      // Delete all review cache entries for this slug (different limits)
      await this.delPattern(this.buildKey('reviews', practiceSlug, '*'));
    }
  }

  async getRatingsCache(practiceSlug: string): Promise<ClinectRating | null> {
    const key = this.buildKey('ratings', practiceSlug);
    return await this.get<ClinectRating>(key);
  }

  async setRatingsCache(practiceSlug: string, data: ClinectRating): Promise<boolean> {
    const key = this.buildKey('ratings', practiceSlug);
    return await this.set(key, data, { ttl: CACHE_TTL_RATINGS });
  }

  async getReviewsCache(practiceSlug: string, limit: number): Promise<ClinectReviews | null> {
    const key = this.buildKey('reviews', practiceSlug, String(limit));
    return await this.get<ClinectReviews>(key);
  }

  async setReviewsCache(practiceSlug: string, limit: number, data: ClinectReviews): Promise<boolean> {
    const key = this.buildKey('reviews', practiceSlug, String(limit));
    return await this.set(key, data, { ttl: CACHE_TTL_REVIEWS });
  }
}

// Create singleton instance
const clinectCache = new ClinectCacheService();

/**
 * Clinect Service Interface
 * Handles all interactions with Clinect API for ratings and reviews
 */
export interface ClinectServiceInterface {
  getRatings(practiceSlug: string): Promise<ClinectRating>;
  getReviews(
    practiceSlug: string,
    limit?: number,
    type?: 'provider' | 'location'
  ): Promise<ClinectReviews>;
  validateSlug(practiceSlug: string): Promise<boolean>;
}

/**
 * Create Clinect service instance
 * Factory pattern for consistent service creation
 */
export function createClinectService(): ClinectServiceInterface {
  return {
    async getRatings(practiceSlug: string): Promise<ClinectRating> {
      const startTime = Date.now();

      try {
        // Check cache first
        const cached = await clinectCache.getRatingsCache(practiceSlug);
        if (cached) {
          log.info('Clinect ratings served from cache', {
            operation: 'get_clinect_ratings',
            practiceSlug,
            source: 'cache',
            duration: Date.now() - startTime,
            component: 'service',
          });
          return cached;
        }

        // Fetch from API
        const url = `${CLINECT_API_BASE}/${CLINECT_GROUP_ID}/provider-score-slug/${practiceSlug}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        });

        if (!response.ok) {
          throw new Error(`Clinect API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('Invalid response format from Clinect API');
        }

        const rating = data[0];

        // Check thresholds
        if (rating.response_count < MIN_RESPONSE_COUNT || rating.score_value < MIN_SCORE_VALUE) {
          log.info('Clinect ratings below threshold', {
            operation: 'get_clinect_ratings',
            practiceSlug,
            responseCount: rating.response_count,
            scoreValue: rating.score_value,
            minResponseCount: MIN_RESPONSE_COUNT,
            minScoreValue: MIN_SCORE_VALUE,
            component: 'service',
          });
          throw new Error('Ratings below display threshold');
        }

        // Add calculated stars (0-5 scale)
        const enrichedRating: ClinectRating = {
          ...rating,
          score_value_stars: (rating.score_value / 100) * 5,
        };

        // Cache result
        await clinectCache.setRatingsCache(practiceSlug, enrichedRating);

        const duration = Date.now() - startTime;
        log.info('Clinect ratings fetched from API', {
          operation: 'get_clinect_ratings',
          practiceSlug,
          responseCount: rating.response_count,
          scoreValue: rating.score_value,
          source: 'api',
          duration,
          slow: duration > SLOW_THRESHOLDS.API_OPERATION,
          component: 'service',
        });

        return enrichedRating;
      } catch (error) {
        const duration = Date.now() - startTime;
        log.error('Failed to fetch Clinect ratings', error, {
          operation: 'get_clinect_ratings',
          practiceSlug,
          duration,
          component: 'service',
        });
        throw error;
      }
    },

    async getReviews(
      practiceSlug: string,
      limit = 10,
      type: 'provider' | 'location' = 'provider'
    ): Promise<ClinectReviews> {
      const startTime = Date.now();

      try {
        // Check cache first
        const cached = await clinectCache.getReviewsCache(practiceSlug, limit);
        if (cached) {
          log.info('Clinect reviews served from cache', {
            operation: 'get_clinect_reviews',
            practiceSlug,
            reviewCount: cached.data.length,
            source: 'cache',
            duration: Date.now() - startTime,
            component: 'service',
          });
          return cached;
        }

        // Fetch from API
        const url = `${CLINECT_API_BASE}/${CLINECT_GROUP_ID}/curated-response/slug/${practiceSlug}?type=${type}&limit=${limit}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        });

        if (!response.ok) {
          throw new Error(`Clinect API error: ${response.status} ${response.statusText}`);
        }

        const reviews = (await response.json()) as ClinectReviews;

        if (!reviews.data || !Array.isArray(reviews.data)) {
          throw new Error('Invalid response format from Clinect API');
        }

        // Sanitize reviews before caching (defense-in-depth security)
        const sanitizedReviews: ClinectReviews = {
          ...reviews,
          data: reviews.data.map(sanitizeReview),
        };

        // Cache sanitized result
        await clinectCache.setReviewsCache(practiceSlug, limit, sanitizedReviews);

        const duration = Date.now() - startTime;
        log.info('Clinect reviews fetched from API', {
          operation: 'get_clinect_reviews',
          practiceSlug,
          reviewCount: sanitizedReviews.data.length,
          limit,
          source: 'api',
          duration,
          slow: duration > SLOW_THRESHOLDS.API_OPERATION,
          component: 'service',
        });

        return sanitizedReviews;
      } catch (error) {
        const duration = Date.now() - startTime;
        log.error('Failed to fetch Clinect reviews', error, {
          operation: 'get_clinect_reviews',
          practiceSlug,
          duration,
          component: 'service',
        });
        throw error;
      }
    },

    async validateSlug(practiceSlug: string): Promise<boolean> {
      try {
        await this.getRatings(practiceSlug);
        return true;
      } catch {
        return false;
      }
    },
  };
}

