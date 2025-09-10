import type { PracticeAttributes } from '@/lib/types/practice';
import { parseServices } from '@/lib/utils/json-parser';

interface ServicesProps {
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Services({ attributes, colorStyles }: ServicesProps) {
  const services = parseServices(attributes.services);

  return (
    <section id="services" className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4">
            Our Services
          </h2>
          <p className="text-lg text-gray-600 font-light max-w-2xl mx-auto">
            Comprehensive rheumatology services delivered with precision and care
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service: string, index: number) => (
            <div key={index} className="group">
              <div className="bg-gray-50 p-8 hover:bg-gray-100 transition-colors">
                <div className="w-12 h-12 flex items-center justify-center mb-6 transition-colors" style={colorStyles.primary}>
                  <span className="text-xl">⚕️</span>
                </div>
                <h3 className="text-xl font-light text-gray-900 mb-3">
                  {service}
                </h3>
                <p className="text-gray-600 font-light">
                  Advanced treatment options tailored to your specific needs and condition.
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
