import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface AboutProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: any;
}

export default function About({ practice, attributes, colorStyles }: AboutProps) {
  return (
    <section id="about" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            About {practice.name}
          </h2>
          <div className="w-24 h-1 mx-auto bg-practice-primary"></div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            {attributes.about_text && (
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                {attributes.about_text}
              </p>
            )}
            
            {attributes.mission_statement && (
              <div className="p-6 rounded-lg bg-practice-primary-50">
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Our Mission</h3>
                <p className="text-gray-700 italic">"{attributes.mission_statement}"</p>
              </div>
            )}
          </div>
          
          <div className="space-y-6">
            <div className="flex items-start">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-practice-primary-100">
                <svg className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Expert Care</h3>
                <p className="text-gray-600">Board-certified rheumatologists with decades of experience</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-practice-primary-100">
                <svg className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.8 18.4L14 10.67V6.5l1.35-1.69c.26-.33.03-.81-.39-.81H9.04c-.42 0-.65.48-.39.81L10 6.5v4.17L4.2 18.4c-.49.66-.02 1.6.8 1.6h14c.82 0 1.29-.94.8-1.6z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Latest Research</h3>
                <p className="text-gray-600">Cutting-edge treatments and clinical research</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4 bg-practice-primary-100">
                <svg className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Patient-Centered</h3>
                <p className="text-gray-600">Personalized care plans tailored to your needs</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
