import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClinectService } from '@/lib/services/clinect-service';
import type { ClinectReviews } from '@/lib/types/practice';

// Mock dependencies
vi.mock('@/lib/logger');

// Mock the cache service at the module level
const mockGetRatingsCache = vi.fn();
const mockSetRatingsCache = vi.fn();
const mockGetReviewsCache = vi.fn();
const mockSetReviewsCache = vi.fn();

vi.mock('@/lib/cache/base', () => ({
  CacheService: class MockCacheService {
    protected namespace = 'clinect';
    protected defaultTTL = 900;
    protected get = vi.fn().mockResolvedValue(null);
    protected set = vi.fn().mockResolvedValue(true);
    protected del = vi.fn().mockResolvedValue(true);
    protected delPattern = vi.fn().mockResolvedValue(0);
    protected buildKey(...parts: string[]) {
      return parts.join(':');
    }
    async getRatingsCache(practiceSlug: string) {
      return mockGetRatingsCache(practiceSlug);
    }
    async setRatingsCache(practiceSlug: string, data: unknown) {
      return mockSetRatingsCache(practiceSlug, data);
    }
    async getReviewsCache(practiceSlug: string, limit: number) {
      return mockGetReviewsCache(practiceSlug, limit);
    }
    async setReviewsCache(practiceSlug: string, limit: number, data: unknown) {
      return mockSetReviewsCache(practiceSlug, limit, data);
    }
    async invalidate() {
      return;
    }
  },
}));

describe('ClinectService', () => {
  let service: ReturnType<typeof createClinectService>;

  beforeEach(() => {
    service = createClinectService();
    vi.clearAllMocks();
    mockGetRatingsCache.mockResolvedValue(null);
    mockSetRatingsCache.mockResolvedValue(true);
    mockGetReviewsCache.mockResolvedValue(null);
    mockSetReviewsCache.mockResolvedValue(true);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getRatings', () => {
    const mockRating = {
      provider_id: '123',
      id_slug: 'test-practice',
      response_count: 156,
      curated_response_count: 42,
      score_value: 92,
    };

    it('should fetch ratings from API and enrich with stars calculation', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => [mockRating],
      } as Response);

      const result = await service.getRatings('test-practice');

      expect(result).toMatchObject({
        ...mockRating,
      });
      expect(result.score_value_stars).toBeCloseTo(4.6, 1); // 92/100 * 5
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api2.clinectsurvey.com/stats/bendcare/provider-score-slug/test-practice',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should throw error if response count is below threshold', async () => {
      const lowCountRating = { ...mockRating, response_count: 0 };
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => [lowCountRating],
      } as Response);

      await expect(service.getRatings('test-practice')).rejects.toThrow(
        'Ratings below display threshold'
      );
    });

    it('should throw error if score value is below threshold', async () => {
      const lowScoreRating = { ...mockRating, score_value: 50 };
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => [lowScoreRating],
      } as Response);

      await expect(service.getRatings('test-practice')).rejects.toThrow(
        'Ratings below display threshold'
      );
    });

    it('should throw error if API returns non-ok status', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(service.getRatings('invalid-slug')).rejects.toThrow(
        'Clinect API error: 404 Not Found'
      );
    });

    it('should throw error if API returns empty array', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response);

      await expect(service.getRatings('test-practice')).rejects.toThrow(
        'Invalid response format from Clinect API'
      );
    });

    it('should throw error if API returns non-array', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'Invalid' }),
      } as Response);

      await expect(service.getRatings('test-practice')).rejects.toThrow(
        'Invalid response format from Clinect API'
      );
    });

    it('should handle API timeout', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('The operation was aborted'));

      await expect(service.getRatings('test-practice')).rejects.toThrow();
    });
  });

  describe('getReviews', () => {
    const mockReviews: ClinectReviews = {
      data: [
        {
          survey_response_id: 'rev-1',
          score_value: 95,
          score_value_pure_5: 4.75,
          approved_comment: 'Excellent care and very professional staff.',
          patient_name: 'John D.',
          approved_at_formatted: 'January 10, 2025',
        },
        {
          survey_response_id: 'rev-2',
          score_value: 88,
          score_value_pure_5: 4.4,
          approved_comment: 'Great experience overall.',
          patient_name: null,
          approved_at_formatted: 'January 9, 2025',
        },
      ],
    };

    it('should fetch reviews from API', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockReviews,
      } as Response);

      const result = await service.getReviews('test-practice', 10);

      expect(result).toEqual(mockReviews);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api2.clinectsurvey.com/stats/bendcare/curated-response/slug/test-practice?type=provider&limit=10',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should use default limit of 10', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockReviews,
      } as Response);

      await service.getReviews('test-practice');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
    });

    it('should use provider type by default', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockReviews,
      } as Response);

      await service.getReviews('test-practice');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('type=provider'),
        expect.any(Object)
      );
    });

    it('should support location type', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockReviews,
      } as Response);

      await service.getReviews('test-practice', 5, 'location');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('type=location'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5'),
        expect.any(Object)
      );
    });

    it('should throw error if API returns non-ok status', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(service.getReviews('test-practice')).rejects.toThrow(
        'Clinect API error: 500 Internal Server Error'
      );
    });

    it('should throw error if response has no data field', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'No data' }),
      } as Response);

      await expect(service.getReviews('test-practice')).rejects.toThrow(
        'Invalid response format from Clinect API'
      );
    });

    it('should throw error if data is not an array', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'not an array' }),
      } as Response);

      await expect(service.getReviews('test-practice')).rejects.toThrow(
        'Invalid response format from Clinect API'
      );
    });
  });

  describe('sanitization', () => {
    it('should sanitize HTML in review comments', async () => {
      const reviewsWithHTML: ClinectReviews = {
        data: [
          {
            survey_response_id: 'rev-1',
            score_value: 95,
            score_value_pure_5: 4.75,
            approved_comment: '<script>alert("xss")</script>Great care!',
            patient_name: 'John D.',
            approved_at_formatted: 'January 10, 2025',
          },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => reviewsWithHTML,
      } as Response);

      const result = await service.getReviews('test-practice', 10);

      // HTML should be stripped
      expect(result.data[0]?.approved_comment).not.toContain('<script>');
      expect(result.data[0]?.approved_comment).not.toContain('alert');
      expect(result.data[0]?.approved_comment).toContain('Great care!');
    });

    it('should sanitize HTML in patient names', async () => {
      const reviewsWithHTML: ClinectReviews = {
        data: [
          {
            survey_response_id: 'rev-1',
            score_value: 95,
            score_value_pure_5: 4.75,
            approved_comment: 'Great care!',
            patient_name: '<b>John</b> <script>alert("xss")</script>',
            approved_at_formatted: 'January 10, 2025',
          },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => reviewsWithHTML,
      } as Response);

      const result = await service.getReviews('test-practice', 10);

      // HTML should be stripped, only text remains
      expect(result.data[0]?.patient_name).not.toContain('<b>');
      expect(result.data[0]?.patient_name).not.toContain('<script>');
      expect(result.data[0]?.patient_name).toContain('John');
    });

    it('should limit comment length to 5000 characters', async () => {
      const longComment = 'a'.repeat(6000);
      const reviewsWithLongComment: ClinectReviews = {
        data: [
          {
            survey_response_id: 'rev-1',
            score_value: 95,
            score_value_pure_5: 4.75,
            approved_comment: longComment,
            patient_name: 'John D.',
            approved_at_formatted: 'January 10, 2025',
          },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => reviewsWithLongComment,
      } as Response);

      const result = await service.getReviews('test-practice', 10);

      expect(result.data[0]?.approved_comment.length).toBe(5000);
    });

    it('should limit patient name length to 255 characters', async () => {
      const longName = 'a'.repeat(300);
      const reviewsWithLongName: ClinectReviews = {
        data: [
          {
            survey_response_id: 'rev-1',
            score_value: 95,
            score_value_pure_5: 4.75,
            approved_comment: 'Great care!',
            patient_name: longName,
            approved_at_formatted: 'January 10, 2025',
          },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => reviewsWithLongName,
      } as Response);

      const result = await service.getReviews('test-practice', 10);

      expect(result.data[0]?.patient_name?.length).toBe(255);
    });
  });

  describe('validateSlug', () => {
    it('should return true if slug has valid ratings', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => [
          {
            provider_id: '123',
            id_slug: 'test-practice',
            response_count: 50,
            curated_response_count: 10,
            score_value: 85,
          },
        ],
      } as Response);

      const result = await service.validateSlug('test-practice');

      expect(result).toBe(true);
    });

    it('should return false if slug has no ratings', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const result = await service.validateSlug('invalid-slug');

      expect(result).toBe(false);
    });

    it('should return false if ratings are below threshold', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => [
          {
            provider_id: '123',
            id_slug: 'test-practice',
            response_count: 0, // Below threshold
            curated_response_count: 0,
            score_value: 50,
          },
        ],
      } as Response);

      const result = await service.validateSlug('test-practice');

      expect(result).toBe(false);
    });
  });
});

