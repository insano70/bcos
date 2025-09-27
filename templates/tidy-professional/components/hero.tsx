import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface HeroProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Hero({ practice, attributes, colorStyles }: HeroProps) {
  return (
    <section className="relative">

      {/* Dark background with clip-path */}
      <div 
        className="absolute inset-0 bg-slate-900 pointer-events-none -z-10" 
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 352px), 0 100%)'
        }}
        aria-hidden="true"
      />

      {/* Background image overlay if provided */}
      {attributes.hero_image_url && (
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10 -z-10 hero-background-image"
          style={{ 
            '--hero-background-image': `url(${attributes.hero_image_url})`,
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 352px), 0 100%)'
          } as React.CSSProperties}
        />
      )}

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <div className="pt-32 pb-20 md:pt-40 md:pb-44">

          {/* Hero content */}
          <div className="max-w-xl mx-auto md:max-w-none md:flex md:items-center md:space-x-8 lg:space-x-16 xl:space-x-20 space-y-16 md:space-y-0">

            {/* Content */}
            <div className="text-center md:text-left md:min-w-[30rem] animate-fade-up">
              {/* Welcome message */}
              {attributes.welcome_message && (
                <p className="font-semibold text-lg mb-4 text-slate-300">
                  {attributes.welcome_message}
                </p>
              )}
              
              {/* Practice name */}
              <h1 className="h1 font-playfair-display text-slate-100 mb-4">
                {practice.name}
              </h1>
              
              {/* Mission statement or about text */}
              <p className="text-xl text-slate-400 mb-8">
                {attributes.mission_statement || 
                 attributes.about_text || 
                 'Expert rheumatology care from board-certified specialists. Compassionate treatment for arthritis, autoimmune conditions, and joint health.'}
              </p>
              
              {/* CTA Buttons */}
              <div className="max-w-xs mx-auto sm:max-w-none sm:flex sm:justify-center md:justify-start space-y-4 sm:space-y-0 sm:space-x-4">
                <div>
                  <a 
                    href="#appointment"
                    className="btn text-white w-full group bg-practice-primary"
                  >
                    Schedule Appointment 
                    <span className="tracking-normal text-blue-300 group-hover:translate-x-0.5 transition-transform duration-150 ease-in-out ml-1">
                      →
                    </span>
                  </a>
                </div>
                <div>
                  <a 
                    href="#about" 
                    className="btn text-white bg-slate-700 hover:bg-slate-800 w-full"
                  >
                    Learn More
                  </a>
                </div>
              </div>
            </div>

            {/* Hero image/video placeholder */}
            <div className="animate-fade-up animate-delay-200">
              {attributes.hero_image_url ? (
                <div className="relative">
                  <img 
                    src={attributes.hero_image_url}
                    alt={`${practice.name} facility`}
                    className="mx-auto shadow-2xl rounded-lg"
                    width={540}
                    height={405}
                  />
                  {/* Play button overlay for potential video */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button className="w-16 h-16 bg-white bg-opacity-90 rounded-full flex items-center justify-center group hover:bg-opacity-100 transition-all duration-300">
                      <svg 
                        className="w-6 h-6 text-blue-600 ml-1 group-hover:scale-110 transition-transform duration-300" 
                        fill="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto shadow-2xl rounded-lg bg-slate-800 border border-slate-700 p-8 text-center">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-100 mb-2">Professional Care</h3>
                  <p className="text-slate-400">State-of-the-art rheumatology services</p>
                </div>
              )}
            </div>

          </div>

          {/* Key highlights */}
          <div className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 animate-fade-up animate-delay-300">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-2">Board Certified</h3>
              <p className="text-slate-400">Expert rheumatologists with specialized training and certification</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-2">Advanced Treatments</h3>
              <p className="text-slate-400">Cutting-edge therapies and personalized treatment plans</p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-2">Compassionate Care</h3>
              <p className="text-slate-400">Patient-centered approach with personalized attention</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
