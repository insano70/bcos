import type { Practice, PracticeAttributes, ColorStyles } from '@/lib/types/practice';

interface AboutProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: ColorStyles;
}

export default function About({ practice, attributes, colorStyles }: AboutProps) {
  return (
    <section id="about" className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-8">
              Advanced Rheumatology Care
            </h2>
            <div className="prose prose-lg text-gray-600 font-light">
              <p>
                {attributes.about_text || 
                  `Our practice combines cutting-edge medical technology with personalized patient care to deliver exceptional rheumatology services.`
                }
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="text-3xl font-light text-gray-900 mb-2">15+</div>
              <div className="text-sm text-gray-600 uppercase tracking-wide">Years Experience</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-light text-gray-900 mb-2">5000+</div>
              <div className="text-sm text-gray-600 uppercase tracking-wide">Patients Treated</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}