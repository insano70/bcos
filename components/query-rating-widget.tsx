'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api/client';

interface QueryRatingWidgetProps {
  queryId: string;
  currentRating: number | null;
  onRatingChange?: () => void;
}

export default function QueryRatingWidget({
  queryId,
  currentRating,
  onRatingChange,
}: QueryRatingWidgetProps) {
  const [rating, setRating] = useState<number | null>(currentRating);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

  const handleRate = async (newRating: number) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await apiClient.post(`/api/data/explorer/history/${queryId}/rate`, {
        rating: newRating,
      });
      setRating(newRating);
      onRatingChange?.();
    } catch (error) {
      console.error('Failed to rate query:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = hoveredStar ?? rating ?? 0;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => handleRate(star)}
          onMouseEnter={() => setHoveredStar(star)}
          onMouseLeave={() => setHoveredStar(null)}
          disabled={isSubmitting}
          className="focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          title={`Rate ${star} star${star === 1 ? '' : 's'}`}
        >
          <svg
            className={`w-4 h-4 transition-colors ${
              star <= displayRating
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-gray-300 text-gray-300 dark:fill-gray-600 dark:text-gray-600'
            } ${hoveredStar !== null && 'cursor-pointer'}`}
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

