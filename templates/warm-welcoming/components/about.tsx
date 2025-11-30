import type { Practice, PracticeAttributes, ColorStyles } from '@/lib/types/practice';

interface AboutProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: ColorStyles;
}

export default function About({ practice, attributes, colorStyles }: AboutProps) {
  return (
    <section id="about" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl font-serif text-amber-900 mb-8">
              Welcome to Our Family
            </h2>
            <div className="prose prose-lg text-amber-800">
              <p className="text-lg leading-relaxed mb-6">
                {attributes.about_text || 
                  `For over two decades, we've been providing compassionate rheumatology care to our community. We understand that dealing with chronic conditions can be overwhelming, which is why we take the time to listen, understand, and create personalized treatment plans that work for your lifestyle.`
                }
              </p>
              {attributes.mission_statement && (
                <div className="bg-amber-50 p-6 rounded-2xl border-l-4 border-amber-400 mt-6">
                  <p className="text-amber-900 font-serif text-lg italic">
                    "{attributes.mission_statement}"
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-amber-100 p-6 rounded-2xl text-center">
              <div className="text-3xl font-serif text-amber-900 mb-2">20+</div>
              <div className="text-amber-800">Years of Care</div>
            </div>
            <div className="bg-orange-100 p-6 rounded-2xl text-center">
              <div className="text-3xl font-serif text-amber-900 mb-2">3000+</div>
              <div className="text-amber-800">Happy Patients</div>
            </div>
            <div className="bg-yellow-100 p-6 rounded-2xl text-center">
              <div className="text-3xl font-serif text-amber-900 mb-2">Family</div>
              <div className="text-amber-800">Approach</div>
            </div>
            <div className="bg-red-100 p-6 rounded-2xl text-center">
              <div className="text-3xl font-serif text-amber-900 mb-2">❤️</div>
              <div className="text-amber-800">Compassionate</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
