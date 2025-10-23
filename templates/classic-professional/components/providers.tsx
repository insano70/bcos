import type { StaffMember } from '@/lib/types/practice';

interface ProvidersProps {
  staff: StaffMember[];
  colorStyles?: any;
}

export default function Providers({ staff, colorStyles }: ProvidersProps) {
  const activeStaff = staff.filter(member => member.is_active);

  return (
    <section id="providers" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Meet Our Providers
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Board-certified rheumatologists dedicated to providing exceptional care
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {activeStaff.map((provider) => (
            <div key={provider.staff_id} className="bg-gray-50 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Provider photo */}
              <div className="bg-gray-200">
                {provider.photo_url ? (
                  <img
                    src={provider.photo_url}
                    alt={provider.name}
                    className="w-full h-128 object-cover"
                  />
                ) : (
                  <div className="w-full h-128 flex items-center justify-center bg-practice-primary-100">
                    <span className="text-8xl text-practice-primary">👨‍⚕️</span>
                  </div>
                )}
              </div>
              
              {/* Provider info */}
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  {provider.name}
                </h3>
                
                {provider.title && (
                  <p className="font-semibold mb-2 text-practice-primary">
                    {provider.title}
                  </p>
                )}
                
                {provider.credentials && (
                  <p className="text-gray-600 text-sm mb-3">
                    {provider.credentials}
                  </p>
                )}
                
                {provider.bio && (
                  <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                    {provider.bio}
                  </p>
                )}
                
                {provider.specialties && provider.specialties.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Specialties:</h4>
                    <div className="flex flex-wrap gap-1">
                      {provider.specialties.map((specialty, index) => (
                        <span
                          key={index}
                          className="inline-block text-xs px-2 py-1 rounded-full bg-practice-primary-100 text-practice-primary"
                        >
                          {specialty}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
