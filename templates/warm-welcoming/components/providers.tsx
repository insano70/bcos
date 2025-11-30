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
    <section id="providers" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-serif text-amber-900 mb-4">
            Meet Our Caring Team
          </h2>
          <p className="text-lg text-amber-800 max-w-2xl mx-auto">
            Dedicated professionals who treat every patient like family
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
                    className="w-48 h-48 object-cover mx-auto rounded-full shadow-lg group-hover:shadow-xl transition-shadow"
                  />
                ) : (
                  <div className="w-48 h-48 bg-amber-200 mx-auto rounded-full flex items-center justify-center shadow-lg">
                    <span className="text-6xl text-amber-700">👨‍⚕️</span>
                  </div>
                )}
              </div>
              
              <h3 className="text-2xl font-serif text-amber-900 mb-2">
                {member.name}
              </h3>
              
              {member.title && (
                <p className="text-amber-700 font-medium mb-2">
                  {member.title}
                </p>
              )}
              
              {member.credentials && (
                <p className="text-amber-600 text-sm mb-4">
                  {member.credentials}
                </p>
              )}
              
              {member.bio && (
                <p className="text-amber-800 leading-relaxed px-4">
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
