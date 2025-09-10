import type { StaffMember } from '@/lib/types/practice';

interface ProvidersProps {
  staff: StaffMember[];
  colorStyles: any;
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {activeStaff.map((provider) => (
            <div key={provider.staff_id} className="bg-gray-50 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Provider photo */}
              <div className="aspect-w-3 aspect-h-4 bg-gray-200">
                {provider.photo_url ? (
                  <img
                    src={provider.photo_url}
                    alt={provider.name}
                    className="w-full h-64 object-cover"
                  />
                ) : (
                  <div className="w-full h-64 flex items-center justify-center" style={colorStyles.primaryBg100}>
                    <span className="text-6xl" style={colorStyles.primaryText}>👨‍⚕️</span>
                  </div>
                )}
              </div>
              
              {/* Provider info */}
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  {provider.name}
                </h3>
                
                {provider.title && (
                  <p className="font-semibold mb-2" style={colorStyles.primaryText}>
                    {provider.title}
                  </p>
                )}
                
                {provider.credentials && (
                  <p className="text-gray-600 text-sm mb-3">
                    {provider.credentials}
                  </p>
                )}
                
                {provider.bio && (
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
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
                          className="inline-block text-xs px-2 py-1 rounded-full"
                          style={{ ...colorStyles.primaryBg100, ...colorStyles.primaryText }}
                        >
                          {specialty}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                <button
                  type="button"
                  className="w-full py-2 rounded-lg transition-colors"
                  style={colorStyles.primary}
                >
                  Schedule with {provider.name.split(' ')[1] || provider.name}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
