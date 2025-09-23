'use client';

import { useState, useEffect } from 'react';

interface ReviewCarouselProps {
  colorStyles: any;
  comments: PracticeComment[];
}

interface PracticeComment {
  comment_id: string;
  practice_id: string;
  commenter_name: string | null;
  commenter_location: string | null;
  comment: string;
  rating: string;
  display_order: number;
  created_at: Date;
}

export default function ReviewCarousel({ colorStyles, comments }: ReviewCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (comments.length === 0) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % comments.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [comments.length]);

  const renderStars = () => {
    return (
      <div className="flex justify-center gap-1 mb-4">
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            className="text-2xl"
            style={{ color: '#FFD700' }}
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

  // Return early if no comments
  if (!comments || comments.length === 0) {
    return null;
  }

  const currentComment = comments[currentIndex];

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
            {comments.map((_, index) => (
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
