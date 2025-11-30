import type { StaffMember, ColorStyles } from '@/lib/types/practice';

interface ProvidersProps {
  staff: StaffMember[];
  colorStyles?: ColorStyles;
}

export default function Providers({ staff, colorStyles }: ProvidersProps) {
  if (!staff || staff.length === 0) {
    return null;
  }

  return (
    <section id="providers" className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4">
            Our Providers
          </h2>
          <p className="text-lg text-gray-600 font-light max-w-2xl mx-auto">
            Meet our team of experienced rheumatology specialists
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {staff.map((member) => (
            <div key={member.staff_id} className="text-center group">
              <div className="mb-6">
                {member.photo_url ? (
                  <img 
                    src={member.photo_url} 
                    alt={member.name}
                    className="w-48 h-48 object-cover mx-auto grayscale group-hover:grayscale-0 transition-all duration-300"
                  />
                ) : (
                  <div className="w-48 h-48 bg-gray-200 mx-auto flex items-center justify-center">
                    <span className="text-6xl text-gray-400">👨‍⚕️</span>
                  </div>
                )}
              </div>
              
              <h3 className="text-xl font-light text-gray-900 mb-2">
                {member.name}
              </h3>
              
              {member.title && (
                <p className="text-gray-600 font-light mb-1">
                  {member.title}
                </p>
              )}
              
              {member.credentials && (
                <p className="text-sm text-gray-500 uppercase tracking-wide mb-4">
                  {member.credentials}
                </p>
              )}
              
              {member.bio && (
                <p className="text-gray-600 font-light text-sm leading-relaxed">
                  {member.bio}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
