import type { Practice, PracticeAttributes, StaffMember } from '@/lib/types/practice';

interface ProvidersProps {
  practice: Practice;
  attributes: PracticeAttributes;
  staff: StaffMember[];
  colorStyles: any;
}

export default function Providers({ practice, attributes, staff, colorStyles }: ProvidersProps) {
  // Filter active staff and sort by display order
  const activeStaff = staff
    .filter(member => member.is_active)
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <section id="providers" className="bg-slate-100">

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="pt-12 md:pt-20">

          {/* Section header */}
          <div className="max-w-3xl mx-auto text-center pb-12 md:pb-20">
            <h2 className="h2 font-playfair-display text-slate-800">
              Meet Our Expert Team
            </h2>
            <p className="text-xl text-slate-600 mt-4">
              Our board-certified rheumatologists and healthcare professionals are dedicated to providing exceptional care.
            </p>
          </div>

        </div>
      </div>

      {/* Staff photos section - full width */}
      {activeStaff.length > 0 && (
        <div className="-ml-28 -mr-28 mb-8 md:mb-16">
          <div className="max-w-[1652px] mx-auto flex items-center space-x-2 md:space-x-4">
            {activeStaff.slice(0, 3).map((member, index) => (
              <div 
                key={member.staff_id} 
                className="relative w-1/3 animate-fade-up" 
                style={{ animationDelay: `${index * 200}ms` }}
              >
                {member.photo_url ? (
                  <img 
                    className="aspect-3/2 object-cover" 
                    src={member.photo_url} 
                    alt={member.name}
                    width={540} 
                    height={360} 
                  />
                ) : (
                  <div className="aspect-3/2 bg-slate-300 flex items-center justify-center">
                    <div className="w-24 h-24 bg-slate-400 rounded-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                    </div>
                  </div>
                )}
                {/* Gradient overlay for first and last images */}
                {index === 0 && (
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-100" aria-hidden="true"></div>
                )}
                {index === 2 && (
                  <div className="absolute inset-0 bg-gradient-to-l from-slate-100" aria-hidden="true"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <div className="py-12 md:py-20">

          {/* Decorative line */}
          <div className="hidden md:block absolute top-0 left-1/2 -ml-px -mt-4 w-0.5 h-12 bg-slate-300" aria-hidden="true"></div>

          {/* Staff cards */}
          {activeStaff.length > 0 ? (
            <div className="max-w-sm mx-auto md:max-w-none grid gap-12 md:grid-cols-2 lg:grid-cols-3 md:gap-x-16 items-start mb-12 md:mb-20">
              {activeStaff.map((member, index) => (
                <div 
                  key={member.staff_id} 
                  className="h-full flex flex-col items-center text-center animate-fade-up" 
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {/* Profile photo */}
                  <div className="inline-flex w-[80px] h-[80px] mb-4 rounded-full overflow-hidden">
                    {member.photo_url ? (
                      <img 
                        src={member.photo_url} 
                        alt={member.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-300 flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Name and title */}
                  <h4 className="h4 font-playfair-display text-slate-800 mb-1">
                    {member.name}
                    {member.credentials && (
                      <span className="text-base font-normal text-slate-600 ml-1">
                        , {member.credentials}
                      </span>
                    )}
                  </h4>
                  
                  {member.title && (
                    <p className="text-sm font-medium text-slate-600 mb-2">
                      {member.title}
                    </p>
                  )}

                  {/* Bio */}
                  {member.bio && (
                    <div className="grow text-slate-500 mb-4 text-sm leading-relaxed">
                      {member.bio}
                    </div>
                  )}

                  {/* Specialties */}
                  {member.specialties && member.specialties.length > 0 && (
                    <div className="mb-4">
                      <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                        Specialties
                      </h5>
                      <div className="flex flex-wrap gap-1 justify-center">
                        {member.specialties.map((specialty, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-2 py-1 text-xs rounded-full border border-practice-primary text-practice-primary"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {member.education && member.education.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                        Education
                      </h5>
                      <div className="text-sm text-slate-600">
                        {member.education.map((edu, idx) => (
                          <div key={idx} className="mb-1">
                            <div className="font-medium">{edu.degree}</div>
                            <div>{edu.school} • {edu.year}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Default content when no staff */
            <div className="max-w-sm mx-auto md:max-w-none grid gap-12 md:grid-cols-2 lg:grid-cols-3 md:gap-x-16 items-start mb-12 md:mb-20">
              <div className="h-full flex flex-col items-center text-center animate-fade-up">
                <div className="inline-flex w-[80px] h-[80px] mb-4">
                  <div className="w-full h-full bg-slate-300 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                </div>
                <h4 className="h4 font-playfair-display text-slate-800 mb-2">Expert Rheumatologists</h4>
                <div className="grow text-slate-500 mb-2">
                  Our board-certified specialists provide comprehensive care for all rheumatic conditions.
                </div>
                <div className="font-sm font-medium text-slate-800">Available for consultation</div>
              </div>

              <div className="h-full flex flex-col items-center text-center animate-fade-up animate-delay-100">
                <div className="inline-flex w-[80px] h-[80px] mb-4">
                  <div className="w-full h-full bg-slate-300 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                </div>
                <h4 className="h4 font-playfair-display text-slate-800 mb-2">Specialized Nurses</h4>
                <div className="grow text-slate-500 mb-2">
                  Dedicated nursing staff trained in rheumatology care and patient education.
                </div>
                <div className="font-sm font-medium text-slate-800">Compassionate care team</div>
              </div>

              <div className="h-full flex flex-col items-center text-center animate-fade-up animate-delay-200">
                <div className="inline-flex w-[80px] h-[80px] mb-4">
                  <div className="w-full h-full bg-slate-300 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                </div>
                <h4 className="h4 font-playfair-display text-slate-800 mb-2">Support Staff</h4>
                <div className="grow text-slate-500 mb-2">
                  Experienced support team ensuring smooth operations and excellent patient experience.
                </div>
                <div className="font-sm font-medium text-slate-800">Here to help you</div>
              </div>
            </div>
          )}

          {/* Call to action */}
          <div className="text-center">
            <a 
              href="#appointment" 
              className="btn text-white group bg-practice-primary"
            >
              Meet Our Team
              <span className="tracking-normal text-blue-300 group-hover:translate-x-0.5 transition-transform duration-150 ease-in-out ml-1">
                →
              </span>
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}
