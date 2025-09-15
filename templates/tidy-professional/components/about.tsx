import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface AboutProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function About({ practice, attributes, colorStyles }: AboutProps) {
  return (
    <section id="about" className="relative">

      {/* Light background */}
      <div className="absolute inset-0 bg-slate-100 pointer-events-none mb-64 md:mb-80" aria-hidden="true"></div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <div className="py-12 md:py-20">

          {/* Section header */}
          <div className="max-w-3xl mx-auto text-center pb-12">
            <h2 className="h2 font-playfair-display text-slate-800 mb-4">
              Expert Care You Can Trust
            </h2>
            <p className="text-xl text-slate-600">
              {attributes.about_text || 
               `At ${practice.name}, we provide comprehensive rheumatology care with a focus on personalized treatment plans and compassionate patient care.`}
            </p>
          </div>

          {/* Content sections */}
          <div className="max-w-3xl mx-auto">

            {/* Mission statement section */}
            {attributes.mission_statement && (
              <div className="bg-white rounded-lg shadow-sm p-8 mb-8 animate-fade-up">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={colorStyles.primaryBg100}>
                      <svg className="w-6 h-6" style={colorStyles.primaryText} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 mb-3">Our Mission</h3>
                    <p className="text-slate-600 leading-relaxed">
                      {attributes.mission_statement}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Key features grid */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              
              {/* Feature 1 */}
              <div className="bg-white rounded-lg shadow-sm p-6 animate-fade-up animate-delay-100">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={colorStyles.primaryBg100}>
                  <svg className="w-6 h-6" style={colorStyles.primaryText} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Board Certified Specialists</h3>
                <p className="text-slate-600">
                  Our rheumatologists are board-certified with specialized training in diagnosing and treating complex rheumatic conditions.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-white rounded-lg shadow-sm p-6 animate-fade-up animate-delay-200">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={colorStyles.primaryBg100}>
                  <svg className="w-6 h-6" style={colorStyles.primaryText} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Patient-Centered Care</h3>
                <p className="text-slate-600">
                  We believe in treating the whole person, not just the condition. Every treatment plan is tailored to your unique needs and lifestyle.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-white rounded-lg shadow-sm p-6 animate-fade-up animate-delay-300">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={colorStyles.primaryBg100}>
                  <svg className="w-6 h-6" style={colorStyles.primaryText} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Advanced Technology</h3>
                <p className="text-slate-600">
                  State-of-the-art diagnostic equipment and treatment technologies ensure you receive the most effective care available.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-white rounded-lg shadow-sm p-6 animate-fade-up animate-delay-300">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={colorStyles.primaryBg100}>
                  <svg className="w-6 h-6" style={colorStyles.primaryText} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Comprehensive Services</h3>
                <p className="text-slate-600">
                  From initial consultation to ongoing management, we provide complete rheumatology care under one roof.
                </p>
              </div>

            </div>

            {/* Insurance and conditions section */}
            <div className="grid md:grid-cols-2 gap-8">
              
              {/* Insurance accepted */}
              {attributes.insurance_accepted && attributes.insurance_accepted.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-6 animate-fade-up">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Insurance Accepted</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {attributes.insurance_accepted.slice(0, 6).map((insurance, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        <span className="text-slate-600">{insurance}</span>
                      </div>
                    ))}
                    {attributes.insurance_accepted.length > 6 && (
                      <p className="text-sm text-slate-500 mt-2">
                        ...and {attributes.insurance_accepted.length - 6} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Conditions treated */}
              {attributes.conditions_treated && attributes.conditions_treated.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-6 animate-fade-up">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Conditions We Treat</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {attributes.conditions_treated.slice(0, 6).map((condition, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        <span className="text-slate-600">{condition}</span>
                      </div>
                    ))}
                    {attributes.conditions_treated.length > 6 && (
                      <p className="text-sm text-slate-500 mt-2">
                        ...and {attributes.conditions_treated.length - 6} more
                      </p>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
