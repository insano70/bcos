'use client';

import { useState, useEffect } from 'react';
import type { PracticeComment, ColorStyles } from '@/lib/types/practice';

interface ReviewCarouselProps {
  colorStyles: ColorStyles;
  comments: PracticeComment[];
}

const FALLBACK_COMMENTS = [
  {
    comment_id: '1',
    practice_id: 'demo',
    commenter_name: 'Sarah Johnson',
    commenter_location: 'Austin, TX',
    comment: 'Dr. Thompson and her team provided exceptional care during my lupus diagnosis and treatment journey.',
    rating: '5',
    display_order: 1,
    created_at: new Date()
  },
  {
    comment_id: '2',
    practice_id: 'demo',
    commenter_name: 'Michael Rodriguez',
    commenter_location: null,
    comment: 'The infusion therapy here is world-class, and the staff always makes me feel comfortable and well-cared for.',
    rating: '5',
    display_order: 2,
    created_at: new Date()
  },
  {
    comment_id: '3',
    practice_id: 'demo',
    commenter_name: null,
    commenter_location: null,
    comment: 'After years of joint pain, I finally found relief with the personalized treatment plan from this practice.',
    rating: '5',
    display_order: 3,
    created_at: new Date()
  },
  {
    comment_id: '4',
    practice_id: 'demo',
    commenter_name: 'Jennifer Martinez',
    commenter_location: 'Dallas, TX',
    comment: 'The comprehensive approach to treating my arthritis has given me my life back. Highly recommend!',
    rating: '5',
    display_order: 4,
    created_at: new Date()
  },
  {
    comment_id: '5',
    practice_id: 'demo',
    commenter_name: 'Robert Chen',
    commenter_location: 'Houston, TX',
    comment: 'Professional, compassionate care with cutting-edge treatments. Best rheumatology practice in the area.',
    rating: '5',
    display_order: 5,
    created_at: new Date()
  }
];

export default function ReviewCarousel({ colorStyles, comments }: ReviewCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const displayComments = comments && comments.length > 0 ? comments : FALLBACK_COMMENTS;

  useEffect(() => {
    if (displayComments.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % displayComments.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [displayComments.length]);

  const renderStars = () => {
    return (
      <div className="flex justify-center gap-1 mb-6">
        {[...Array(5)].map((_, i) => (
          <svg
            key={i}
            className="w-6 h-6 text-yellow-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
    );
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  if (!displayComments || displayComments.length === 0) {
    return null;
  }

  const currentComment = displayComments[currentIndex];

  if (!currentComment) {
    return null;
  }

  return (
    <section className="py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="font-playfair-display text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            What Our Patients Say
          </h2>
          <div className="w-24 h-1 mx-auto bg-practice-primary rounded-full"></div>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 text-center min-h-[320px] flex flex-col justify-center border border-slate-100">
            {renderStars()}

            <blockquote className="text-xl md:text-2xl text-slate-700 mb-8 leading-relaxed font-inter">
              "{currentComment.comment}"
            </blockquote>

            <div>
              {currentComment.commenter_name && (
                <p className="font-semibold text-lg text-slate-900 mb-1">
                  {currentComment.commenter_name}
                </p>
              )}
              {currentComment.commenter_location && (
                <p className="text-slate-500">
                  {currentComment.commenter_location}
                </p>
              )}
              {!currentComment.commenter_name && !currentComment.commenter_location && (
                <p className="text-slate-500 italic">
                  Anonymous Review
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-center mt-8 space-x-3">
            {displayComments.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? 'w-8 bg-practice-primary'
                    : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
                aria-label={`Go to review ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
