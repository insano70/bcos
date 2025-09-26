import type { PracticeAttributes } from '@/lib/types/practice';
import { parseServices } from '@/lib/utils/json-parser';

interface ServicesProps {
  attributes: PracticeAttributes;
  colorStyles?: any;
}

export default function Services({ attributes, colorStyles }: ServicesProps) {
  const services = parseServices(attributes.services);

  return (
    <section id="services" className="py-20 bg-practice-secondary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-serif mb-4 text-practice-primary">
            How We Can Help You
          </h2>
          <p className="text-lg max-w-2xl mx-auto text-practice-primary">
            Every treatment is personalized with care and compassion
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service: string, index: number) => (
            <div key={index} className="bg-white p-8 rounded-3xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-practice-primary-100">
                <span className="text-2xl">🤗</span>
              </div>
              <h3 className="text-xl font-serif mb-4 text-practice-primary">
                {service}
              </h3>
              <p className="leading-relaxed text-practice-primary">
                Personalized care designed around your unique needs and comfort.
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
