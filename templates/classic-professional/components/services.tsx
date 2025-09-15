import type { PracticeAttributes } from '@/lib/types/practice';
import { parseServices, parseConditions } from '@/lib/utils/json-parser';

interface ServicesProps {
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Services({ attributes, colorStyles }: ServicesProps) {
  const services = parseServices(attributes.services);
  const conditions = parseConditions(attributes.conditions_treated);

  return (
    <section id="services" className="py-20" style={colorStyles.secondary}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Services */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Our Services
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Comprehensive rheumatology care using the latest treatments and technologies
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {services.map((service, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style={colorStyles.primaryBg100}>
                <span className="text-xl" style={colorStyles.primaryText}>💉</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">{service}</h3>
              <p className="text-gray-600">Expert care and treatment for optimal patient outcomes.</p>
            </div>
          ))}
        </div>

        {/* Conditions Treated */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Conditions We Treat
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Specialized care for a wide range of rheumatologic conditions
          </p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {conditions.map((condition, index) => (
            <div key={index} className="bg-white rounded-lg p-4 text-center shadow-sm hover:shadow-md transition-shadow">
              <h4 className="font-semibold text-gray-900">{condition}</h4>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
