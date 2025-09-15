import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface ServicesProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Services({ practice, attributes, colorStyles }: ServicesProps) {
  // Default rheumatology services if none provided
  const defaultServices = [
    {
      title: "Arthritis Treatment",
      description: "Comprehensive care for rheumatoid arthritis, osteoarthritis, and other joint conditions.",
      icon: (
        <svg className="w-16 h-16 mb-4" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect className="fill-current" style={colorStyles.primary} width="64" height="64" rx="32" />
          <path className="fill-white" d="M32 16c-8.837 0-16 7.163-16 16s7.163 16 16 16 16-7.163 16-16-7.163-16-16-16zm0 28c-6.627 0-12-5.373-12-12s5.373-12 12-12 12 5.373 12 12-5.373 12-12 12zm-2-18h4v8h-4v-8zm0 10h4v4h-4v-4z"/>
        </svg>
      )
    },
    {
      title: "Autoimmune Disorders",
      description: "Expert diagnosis and treatment of lupus, scleroderma, and other autoimmune conditions.",
      icon: (
        <svg className="w-16 h-16 mb-4" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect className="fill-current" style={colorStyles.primary} width="64" height="64" rx="32" />
          <path className="fill-white" d="M32 18c-7.732 0-14 6.268-14 14s6.268 14 14 14 14-6.268 14-14-6.268-14-14-14zm0 24c-5.523 0-10-4.477-10-10s4.477-10 10-10 10 4.477 10 10-4.477 10-10 10zm-1-15h2v6h-2v-6zm0 8h2v2h-2v-2z"/>
        </svg>
      )
    },
    {
      title: "Infusion Therapy",
      description: "State-of-the-art infusion center for biologic medications and specialized treatments.",
      icon: (
        <svg className="w-16 h-16 mb-4" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect className="fill-current" style={colorStyles.primary} width="64" height="64" rx="32" />
          <path className="fill-white" d="M28 18v4h8v-4h-8zm-4 8v20h16V26H24zm12 16h-8v-12h8v12zm-6-10h4v8h-4v-8z"/>
        </svg>
      )
    },
    {
      title: "Joint Injections",
      description: "Minimally invasive joint injections for pain relief and improved mobility.",
      icon: (
        <svg className="w-16 h-16 mb-4" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect className="fill-current" style={colorStyles.primary} width="64" height="64" rx="32" />
          <path className="fill-white" d="M32 16l-8 8v24h16V24l-8-8zm4 28h-8v-16h8v16zm-6-14h4v12h-4V30z"/>
        </svg>
      )
    },
    {
      title: "Osteoporosis Care",
      description: "Comprehensive bone health evaluation and treatment for osteoporosis prevention.",
      icon: (
        <svg className="w-16 h-16 mb-4" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect className="fill-current" style={colorStyles.primary} width="64" height="64" rx="32" />
          <path className="fill-white" d="M32 18c-2 0-4 1-4 3v22c0 2 2 3 4 3s4-1 4-3V21c0-2-2-3-4-3zm0 22c-1.1 0-2-.9-2-2V22c0-1.1.9-2 2-2s2 .9 2 2v16c0 1.1-.9 2-2 2z"/>
        </svg>
      )
    },
    {
      title: "Clinical Research",
      description: "Access to cutting-edge clinical trials and the latest treatment innovations.",
      icon: (
        <svg className="w-16 h-16 mb-4" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect className="fill-current" style={colorStyles.primary} width="64" height="64" rx="32" />
          <path className="fill-white" d="M32 16c-8.837 0-16 7.163-16 16s7.163 16 16 16 16-7.163 16-16-7.163-16-16-16zm0 28c-6.627 0-12-5.373-12-12s5.373-12 12-12 12 5.373 12 12-5.373 12-12 12zm-1-18h2v8h6v2h-8v-10z"/>
        </svg>
      )
    }
  ];

  const services = attributes.services && attributes.services.length > 0 
    ? attributes.services.map((service, index) => ({
        title: service,
        description: `Professional ${service.toLowerCase()} services tailored to your specific needs.`,
        icon: defaultServices[index % defaultServices.length]?.icon || defaultServices[0]?.icon
      }))
    : defaultServices;

  return (
    <section id="services">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="py-12 md:py-20">

          {/* Section header */}
          <div className="max-w-3xl mx-auto text-center pb-12">
            <h2 className="h2 font-playfair-display text-slate-800 mb-4">
              Comprehensive Rheumatology Services
            </h2>
            <p className="text-xl text-slate-600">
              Expert care for all aspects of rheumatic and autoimmune conditions, 
              from diagnosis to advanced treatment options.
            </p>
          </div>

          {/* Services grid with decorative lines */}
          <div className="relative max-w-sm mx-auto grid gap-16 md:grid-cols-2 lg:grid-cols-3 lg:gap-y-20 items-start md:max-w-2xl lg:max-w-none">

            {/* Decorative lines */}
            <div className="absolute inset-0 -my-8 md:-my-12 pointer-events-none hidden md:flex" aria-hidden="true">
              <div className="h-full w-full border-l last:border-r odd:hidden lg:odd:block border-slate-100"></div>
              <div className="h-full w-full border-l last:border-r odd:hidden lg:odd:block border-slate-100"></div>
              <div className="h-full w-full border-l last:border-r odd:hidden lg:odd:block border-slate-100"></div>
              <div className="h-full w-full border-l last:border-r odd:hidden lg:odd:block border-slate-100"></div>
            </div>

            {/* Service items */}
            {services.map((service, index) => (
              <div 
                key={index}
                className="relative animate-fade-up text-center" 
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {service.icon}
                <h3 className="h4 font-playfair-display mb-2 text-slate-800">
                  {service.title}
                </h3>
                <p className="text-lg text-slate-500">
                  {service.description}
                </p>
              </div>
            ))}

          </div>

          {/* Call to action */}
          <div className="text-center mt-12">
            <p className="text-lg text-slate-600 mb-6">
              Ready to start your journey to better joint health?
            </p>
            <a 
              href="#appointment" 
              className="btn text-white group"
              style={colorStyles.primary}
            >
              Schedule Consultation
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
