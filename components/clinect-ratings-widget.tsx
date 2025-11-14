'use client';

import { useState, useEffect } from 'react';
import type { ClinectRating, ClinectReview } from '@/lib/types/practice';

export interface ClinectRatingsWidgetProps {
  practiceSlug: string;
  size?: 'tiny' | 'small' | 'medium';
  showReviews?: boolean;
  reviewLimit?: number;
  animate?: boolean;
  initialRatings?: ClinectRating | null | undefined;
  initialReviews?: ClinectReview[] | null | undefined;
  className?: string;
}

export default function ClinectRatingsWidget({
  practiceSlug,
  size = 'small',
  showReviews = true,
  reviewLimit = 20,
  animate = true,
  initialRatings = null,
  initialReviews = null,
  className = '',
}: ClinectRatingsWidgetProps) {
  const [ratings, setRatings] = useState<ClinectRating | null>(initialRatings);
  const [reviews, setReviews] = useState<ClinectReview[]>(initialReviews || []);
  const [loading, setLoading] = useState(!initialRatings);
  const [error, setError] = useState<string | null>(null);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);

  // Fetch ratings if not provided as initial data
  useEffect(() => {
    if (initialRatings) return;

    const fetchRatings = async () => {
      try {
        const response = await fetch(`/api/clinect/ratings/${practiceSlug}`);
        if (!response.ok) throw new Error('Failed to fetch ratings');

        const data = await response.json();
        setRatings(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchRatings();
  }, [practiceSlug, initialRatings]);

  // Fetch reviews if showReviews is enabled and not provided as initial data
  useEffect(() => {
    if (!showReviews || initialReviews) return;

    const fetchReviews = async () => {
      try {
        const response = await fetch(
          `/api/clinect/reviews/${practiceSlug}?limit=${reviewLimit}`
        );
        if (!response.ok) throw new Error('Failed to fetch reviews');

        const data = await response.json();
        setReviews(data.data.data || []);
      } catch (err) {
        // Reviews are optional, log but don't show error to user
        console.error('Failed to fetch reviews:', err);
      }
    };

    fetchReviews();
  }, [practiceSlug, showReviews, reviewLimit, initialReviews]);

  // Auto-rotate reviews every 5 seconds
  useEffect(() => {
    if (!showReviews || reviews.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentReviewIndex((prev) => (prev + 1) % reviews.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [showReviews, reviews.length]);

  // Navigation handlers
  const handlePrevious = () => {
    setCurrentReviewIndex((prev) => (prev === 0 ? reviews.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentReviewIndex((prev) => (prev + 1) % reviews.length);
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="animate-pulse text-gray-500">Loading ratings...</div>
      </div>
    );
  }

  if (error || !ratings) {
    return null; // Fail silently, fallback handled by parent
  }

  const currentReview = reviews[currentReviewIndex];
  const starPercentage = (ratings.score_value_stars / 5) * 100;

  // Get dimensions for star sprites based on size
  const dimensions = {
    tiny: { width: 112, height: 20, overlayOffset: 21 },
    small: { width: 158, height: 28, overlayOffset: 31 },
    medium: { width: 204, height: 36, overlayOffset: 38 },
  };

  const { width, height, overlayOffset } = dimensions[size];

  return (
    <div className={`clinect-ratings ${className}`}>
      {/* Star Rating Display */}
      <div className="flex flex-col items-center justify-center gap-4 mb-6">
        <div className="relative inline-block">
          {/* Background stars (empty) - using CSS sprites */}
          <div
            className={`clinect-rating-background ${size}`}
            style={{
              width: `${width}px`,
              height: `${height}px`,
              backgroundImage: `url(/clinect/sprites/sprites_stars_${size}.png)`,
              backgroundPosition: '0 0',
              backgroundRepeat: 'no-repeat',
              position: 'relative',
            }}
          >
            {/* Foreground stars (filled) - overlay */}
            <div
              className={`clinect-rating-overlay ${size} absolute top-0 left-0 overflow-hidden`}
              style={{
                width: animate ? `${starPercentage}%` : `${starPercentage}%`,
                height: `${height}px`,
                backgroundImage: `url(/clinect/sprites/sprites_stars_${size}.png)`,
                backgroundPosition: `0 -${overlayOffset}px`,
                backgroundRepeat: 'no-repeat',
                transition: animate ? 'width 1s ease-in-out' : 'none',
              }}
            />
          </div>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold">{ratings.score_value_stars.toFixed(1)}</span> out of 5
          stars
        </div>
      </div>

      {/* Review Count */}
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 mb-8">
        {ratings.response_count.toLocaleString()} ratings
        {ratings.curated_response_count > 0 && (
          <>, {ratings.curated_response_count.toLocaleString()} reviews</>
        )}
      </div>

      {/* Review Carousel */}
      {showReviews && reviews.length > 0 && currentReview && (
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 md:p-12 text-center min-h-[280px] flex flex-col justify-center relative">
            {/* Review Stars */}
            <div className="flex justify-center gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <span
                  key={`star-${currentReview.survey_response_id}-${i}`}
                  className={`text-2xl ${
                    i < Math.round(currentReview.score_value_pure_5)
                      ? 'text-yellow-400'
                      : 'text-gray-300 dark:text-gray-600'
                  }`}
                >
                  ★
                </span>
              ))}
            </div>

            {/* Review Comment */}
            <blockquote className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 mb-6 leading-relaxed italic">
              "{currentReview.approved_comment}"
            </blockquote>

            {/* Reviewer Info */}
            <div>
              {currentReview.patient_name && (
                <p className="font-semibold text-lg text-gray-900 dark:text-gray-100 mb-1">
                  {currentReview.patient_name}
                </p>
              )}
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {currentReview.approved_at_formatted}
              </p>
            </div>

            {/* Navigation Buttons - Half in, half out of card edges */}
            {reviews.length > 1 && (
              <>
                {/* Previous Button */}
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 bg-white hover:bg-white dark:bg-gray-700 dark:hover:bg-gray-600 p-3 rounded-full shadow-xl transition-all hover:scale-110 border border-gray-200 dark:border-gray-600"
                  aria-label="Previous review"
                >
                  <svg
                    className="w-6 h-6 text-gray-700 dark:text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                {/* Next Button */}
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 bg-white hover:bg-white dark:bg-gray-700 dark:hover:bg-gray-600 p-3 rounded-full shadow-xl transition-all hover:scale-110 border border-gray-200 dark:border-gray-600"
                  aria-label="Next review"
                >
                  <svg
                    className="w-6 h-6 text-gray-700 dark:text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

