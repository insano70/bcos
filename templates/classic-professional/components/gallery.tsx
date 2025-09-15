import type { PracticeAttributes } from '@/lib/types/practice';

interface GalleryProps {
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Gallery({ attributes, colorStyles }: GalleryProps) {
  // Don't render if no gallery images
  if (!attributes.gallery_images || attributes.gallery_images.length === 0) {
    return null;
  }

  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Our Practice
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Take a look inside our modern facilities and patient care areas
          </p>
        </div>
        
        {/* 3-column grid with no gaps - images touch each other */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {attributes.gallery_images.map((image, index) => (
            <div key={index} className="aspect-square overflow-hidden">
              <img
                src={image}
                alt={`Practice gallery image ${index + 1}`}
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-300 cursor-pointer"
                onClick={() => {
                  // Optional: Add lightbox functionality later
                  window.open(image, '_blank');
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
