import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface HeroProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Hero({ practice, attributes, colorStyles }: HeroProps) {
  return (
    <section className="relative bg-white py-20 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-light text-gray-900 leading-tight mb-6">
              {attributes.welcome_message || `Modern Rheumatology Care`}
            </h1>
            <p className="text-xl text-gray-600 font-light leading-relaxed mb-8">
              {attributes.about_text || `Experience the future of rheumatology with our technology-driven approach to treating arthritis, lupus, and autoimmune conditions.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="#appointment" 
                className="px-8 py-3 text-lg font-light transition-colors text-center bg-practice-primary"
              >
                Schedule Consultation
              </a>
              <a 
                href="#services" 
                className="border px-8 py-3 text-lg font-light transition-colors text-center border-practice-primary"
              >
                Our Services
              </a>
            </div>
          </div>

          {/* Image */}
          <div className="relative">
            {attributes.hero_image_url ? (
              <img 
                src={attributes.hero_image_url} 
                alt={`${practice.name} modern facility`}
                className="w-full h-96 object-cover"
              />
            ) : (
              <div className="w-full h-96 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl text-gray-400 mb-4">🏥</div>
                  <p className="text-gray-600 font-light">Modern Medical Facility</p>
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
