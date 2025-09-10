import type { PracticeAttributes } from '@/lib/types/practice';

interface ServicesProps {
  attributes: PracticeAttributes;
}

export default function Services({ attributes }: ServicesProps) {
  const defaultServices = [
    'Rheumatoid Arthritis Care',
    'Lupus Support & Treatment',
    'Gentle Joint Therapy',
    'Osteoporosis Management',
    'Comfortable Infusion Services',
    'Pain Relief Solutions'
  ];

  const services = attributes.services ? 
    JSON.parse(attributes.services) : 
    defaultServices;

  return (
    <section id="services" className="py-20 bg-amber-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-serif text-amber-900 mb-4">
            How We Can Help You
          </h2>
          <p className="text-lg text-amber-800 max-w-2xl mx-auto">
            Every treatment is personalized with care and compassion
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service: string, index: number) => (
            <div key={index} className="bg-white p-8 rounded-3xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-16 h-16 bg-amber-200 rounded-full flex items-center justify-center mb-6">
                <span className="text-2xl">🤗</span>
              </div>
              <h3 className="text-xl font-serif text-amber-900 mb-4">
                {service}
              </h3>
              <p className="text-amber-800 leading-relaxed">
                Personalized care designed around your unique needs and comfort.
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
