'use client';

import { useState, useEffect } from 'react';
import type { PracticeComment } from '@/lib/types/practice';

interface ReviewCarouselProps {
  colorStyles: any;
  comments: PracticeComment[];
}

// Fallback sample comments if no real data exists
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

  // Use real comments if available, otherwise use fallback
  const displayComments = comments && comments.length > 0 ? comments : FALLBACK_COMMENTS;

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (displayComments.length === 0) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % displayComments.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [displayComments.length]);

  const renderStars = () => {
    return (
      <div className="flex justify-center gap-1 mb-4">
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            className="text-2xl text-yellow-400"
          >
            ★
          </span>
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
    <section className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            What Our Patients Say
          </h2>
          <div className="w-24 h-1 mx-auto" style={{ backgroundColor: colorStyles.primary.backgroundColor }}></div>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Main review card */}
          <div className="bg-white rounded-xl shadow-lg p-8 md:p-12 text-center min-h-[280px] flex flex-col justify-center">
            {renderStars()}
            
            <blockquote className="text-xl md:text-2xl text-gray-700 mb-6 leading-relaxed italic">
              "{currentComment.comment}"
            </blockquote>
            
            <div>
              {currentComment.commenter_name && (
                <p className="font-semibold text-lg text-gray-900 mb-1">
                  {currentComment.commenter_name}
                </p>
              )}
              {currentComment.commenter_location && (
                <p className="text-gray-500">
                  {currentComment.commenter_location}
                </p>
              )}
              {!currentComment.commenter_name && !currentComment.commenter_location && (
                <p className="text-gray-500 italic">
                  Anonymous Review
                </p>
              )}
            </div>
          </div>

          {/* Carousel indicators */}
          <div className="flex justify-center mt-8 space-x-2">
            {displayComments.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? 'w-8'
                    : 'opacity-50 hover:opacity-75'
                }`}
                style={{
                  backgroundColor: index === currentIndex 
                    ? colorStyles.primary.backgroundColor 
                    : '#CBD5E1'
                }}
                aria-label={`Go to review ${index + 1}`}
              />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
