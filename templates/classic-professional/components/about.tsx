import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface AboutProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function About({ practice, attributes, colorStyles }: AboutProps) {
  return (
    <section id="about" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            About {practice.name}
          </h2>
          <div className="w-24 h-1 mx-auto" style={{ backgroundColor: colorStyles.primary.backgroundColor }}></div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            {attributes.about_text && (
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                {attributes.about_text}
              </p>
            )}
            
            {attributes.mission_statement && (
              <div className="p-6 rounded-lg" style={colorStyles.primaryBg50}>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Our Mission</h3>
                <p className="text-gray-700 italic">"{attributes.mission_statement}"</p>
              </div>
            )}
          </div>
          
          <div className="space-y-6">
            <div className="flex items-start">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4" style={colorStyles.primaryBg100}>
                <span className="text-xl" style={colorStyles.primaryText}>⭐</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Expert Care</h3>
                <p className="text-gray-600">Board-certified rheumatologists with decades of experience</p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4" style={colorStyles.primaryBg100}>
                <span className="text-xl" style={colorStyles.primaryText}>🔬</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Latest Research</h3>
                <p className="text-gray-600">Cutting-edge treatments and clinical research</p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mr-4" style={colorStyles.primaryBg100}>
                <span className="text-xl" style={colorStyles.primaryText}>❤️</span>
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
