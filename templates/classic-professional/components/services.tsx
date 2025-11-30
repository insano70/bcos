import type { PracticeAttributes, ColorStyles } from '@/lib/types/practice';
import { parseServices, parseConditions } from '@/lib/utils/json-parser';

interface ServicesProps {
  attributes: PracticeAttributes;
  colorStyles?: ColorStyles | undefined;
}

export default function Services({ attributes, colorStyles }: ServicesProps) {
  const services = parseServices(attributes.services);
  const conditions = parseConditions(attributes.conditions_treated);

  // Icon mapping for common services
  const getServiceIcon = (index: number) => {
    const icons = [
      // Icon 1: Medical badge (arthritis/general treatment)
      <svg key={index} className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
      </svg>,
      // Icon 2: Test tube (lab/autoimmune)
      <svg key={index} className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19.8 18.4L14 10.67V6.5l1.35-1.69c.26-.33.03-.81-.39-.81H9.04c-.42 0-.65.48-.39.81L10 6.5v4.17L4.2 18.4c-.49.66-.02 1.6.8 1.6h14c.82 0 1.29-.94.8-1.6z"/>
      </svg>,
      // Icon 3: IV/infusion
      <svg key={index} className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
      </svg>,
      // Icon 4: Syringe (joint injections)
      <svg key={index} className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17 4v2H9v2h8v2h2V4h-2zm0 8v8c0 1.1-.9 2-2 2H9c-1.1 0-2-.9-2-2v-8h10zm-2 0H9v6h6v-6z"/>
      </svg>,
      // Icon 5: Bone (osteoporosis)
      <svg key={index} className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M15 16h4v2h-4v-2zm0-8h7v2h-7V8zm0 4h6v2h-6v-2zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3v10zM14 5h-3l-1-1H6L5 5H2v2h12V5z"/>
      </svg>,
      // Icon 6: Research/microscope
      <svg key={index} className="w-6 h-6 text-practice-primary" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7-.25c.22 0 .41.1.55.25.12.13.2.31.2.5 0 .41-.34.75-.75.75s-.75-.34-.75-.75c0-.19.08-.37.2-.5.14-.15.33-.25.55-.25zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5z"/>
      </svg>,
    ];
    return icons[index % icons.length];
  };

  return (
    <section id="services" className="py-20 bg-practice-secondary">
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
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 bg-practice-primary-100">
                {getServiceIcon(index)}
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
