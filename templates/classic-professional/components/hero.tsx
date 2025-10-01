import type { Practice, PracticeAttributes, ColorStyles } from '@/lib/types/practice';

interface HeroProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: ColorStyles;
}

export default function Hero({ practice, attributes, colorStyles }: HeroProps) {
  return (
    <section className="relative py-20 gradient-practice">
      {/* Background image if provided */}
      {attributes.hero_image_url && (
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10"
          style={{ backgroundImage: `url(${attributes.hero_image_url})` }}
        />
      )}
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          {/* Welcome message */}
          {attributes.welcome_message && (
            <p className="font-semibold text-lg mb-4 text-practice-primary">
              {attributes.welcome_message}
            </p>
          )}
          
          {/* Practice name */}
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            {practice.name}
          </h1>
          
          {/* Mission statement or about text */}
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            {attributes.mission_statement || 
             attributes.about_text || 
             'Expert rheumatology care from board-certified specialists.'}
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              className="px-8 py-4 rounded-lg text-lg font-semibold transition-colors bg-practice-primary"
            >
              Schedule Appointment
            </button>
            <button
              type="button"
              className="bg-white px-8 py-4 rounded-lg text-lg font-semibold border-2 transition-colors border-practice-primary"
            >
              Learn More
            </button>
          </div>
          
          {/* Key highlights */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary">
                <span className="text-white text-2xl">🩺</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Board Certified</h3>
              <p className="text-gray-600">Expert rheumatologists with specialized training</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary">
                <span className="text-white text-2xl">💉</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Advanced Treatments</h3>
              <p className="text-gray-600">Infusion therapy and cutting-edge care</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary">
                <span className="text-white text-2xl">🤝</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Compassionate Care</h3>
              <p className="text-gray-600">Personalized treatment plans for every patient</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
