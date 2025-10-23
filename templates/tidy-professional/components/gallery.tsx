'use client';

import { useState } from 'react';
import type { PracticeAttributes, ColorStyles } from '@/lib/types/practice';

interface GalleryProps {
  attributes: PracticeAttributes;
  colorStyles?: ColorStyles;
}

export default function Gallery({ attributes, colorStyles }: GalleryProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (!attributes.gallery_images || attributes.gallery_images.length === 0) {
    return null;
  }

  const openLightbox = (image: string) => {
    setSelectedImage(image);
  };

  const closeLightbox = () => {
    setSelectedImage(null);
  };

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="font-playfair-display text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Our Practice
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto font-inter">
            Take a look inside our modern facilities and patient care areas
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {attributes.gallery_images.map((image, index) => (
            <div
              key={index}
              className="aspect-[4/3] overflow-hidden rounded-lg group cursor-pointer"
              onClick={() => openLightbox(image)}
            >
              <img
                src={image}
                alt={`Practice gallery image ${index + 1}`}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
            </div>
          ))}
        </div>
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <div className="relative max-w-7xl max-h-full">
            <img
              src={selectedImage}
              alt="Gallery image"
              className="max-w-full max-h-full object-contain"
            />

            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 text-white hover:text-slate-300 transition-colors"
              aria-label="Close"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
