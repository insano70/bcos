import type { Practice, PracticeAttributes, ColorStyles } from '@/lib/types/practice';

interface ContactProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: ColorStyles;
}

export default function Contact({ practice, attributes, colorStyles }: ContactProps) {
  // Format business hours for display
  const formatBusinessHours = () => {
    if (!attributes.business_hours) return null;
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    return days.map((day, index) => {
      const schedule = attributes.business_hours?.[day as keyof typeof attributes.business_hours];
      if (!schedule) return null;
      
      return {
        day: dayLabels[index],
        hours: schedule.closed 
          ? 'Closed' 
          : `${schedule.open} - ${schedule.close}`
      };
    }).filter(Boolean);
  };

  const businessHours = formatBusinessHours();

  return (
    <section id="contact" className="bg-slate-100">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <div className="py-12 md:py-20">

          {/* Decorative element */}
          <div className="absolute right-0 -mt-4 -mr-1 fill-slate-300 hidden lg:block" aria-hidden="true">
            <svg className="fill-slate-300" width="56" height="43">
              <path d="M4.532 30.45C15.785 23.25 24.457 12.204 29.766.199c.034-.074-.246-.247-.3-.186-4.227 5.033-9.298 9.282-14.372 13.162C10 17.07 4.919 20.61.21 24.639c-1.173 1.005 2.889 6.733 4.322 5.81M18.96 42.198c12.145-4.05 24.12-8.556 36.631-12.365.076-.024.025-.349-.055-.347-6.542.087-13.277.083-19.982.827-6.69.74-13.349 2.24-19.373 5.197-1.53.75 1.252 7.196 2.778 6.688" />
            </svg>
          </div>

          <div className="relative max-w-3xl mx-auto text-center">

            {/* Section header */}
            <div className="pb-12">
              <h2 className="h2 font-playfair-display text-slate-800 mb-4">
                Ready to Take Control of Your Joint Health?
              </h2>
              <p className="text-xl text-slate-500 mb-8">
                Contact us today to schedule your consultation and start your journey to better health and mobility.
              </p>
            </div>

            {/* Contact information grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">

              {/* Phone */}
              {attributes.phone && (
                <div className="bg-white rounded-lg shadow-sm p-6 animate-fade-up">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary-100">
                    <svg className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">Call Us</h3>
                  <a 
                    href={`tel:${attributes.phone}`}
                    className="text-slate-600 hover:text-blue-600 transition-colors"
                  >
                    {attributes.phone}
                  </a>
                </div>
              )}

              {/* Email */}
              {attributes.email && (
                <div className="bg-white rounded-lg shadow-sm p-6 animate-fade-up animate-delay-100">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary-100">
                    <svg className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">Email Us</h3>
                  <a 
                    href={`mailto:${attributes.email}`}
                    className="text-slate-600 hover:text-blue-600 transition-colors"
                  >
                    {attributes.email}
                  </a>
                </div>
              )}

              {/* Address */}
              {(attributes.address_line1 || attributes.city) && (
                <div className="bg-white rounded-lg shadow-sm p-6 animate-fade-up animate-delay-200">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary-100">
                    <svg className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">Visit Us</h3>
                  <div className="text-slate-600">
                    {attributes.address_line1 && <div>{attributes.address_line1}</div>}
                    {attributes.address_line2 && <div>{attributes.address_line2}</div>}
                    {(attributes.city || attributes.state || attributes.zip_code) && (
                      <div>
                        {attributes.city}{attributes.city && attributes.state && ', '}{attributes.state} {attributes.zip_code}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Business hours */}
            {businessHours && businessHours.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6 mb-8 animate-fade-up">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Office Hours</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {businessHours.map((schedule, index) => (
                    <div key={index} className="flex justify-between items-center py-1">
                      <span className="text-slate-600">{schedule?.day}</span>
                      <span className="text-slate-800 font-medium">{schedule?.hours}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Call to action */}
            <div>
              <a 
                href="#appointment" 
                className="btn text-white group bg-practice-primary"
              >
                Schedule Your Appointment
                <span className="tracking-normal text-blue-300 group-hover:translate-x-0.5 transition-transform duration-150 ease-in-out ml-1">
                  →
                </span>
              </a>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
