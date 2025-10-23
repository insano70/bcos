import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface FooterProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: any;
}

export default function Footer({ practice, attributes, colorStyles }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* Top area: Blocks */}
        <div className="grid sm:grid-cols-12 gap-8 py-8 md:py-12">

          {/* 1st block - Practice info */}
          <div className="sm:col-span-12 lg:col-span-4 lg:max-w-xs">
            <div className="mb-2">
              {/* Logo */}
              {attributes.logo_url ? (
                <img 
                  src={attributes.logo_url} 
                  alt={`${practice.name} logo`}
                  className="h-8 w-auto"
                />
              ) : (
                <div className="text-2xl font-bold font-playfair-display text-practice-primary">
                  {practice.name}
                </div>
              )}
            </div>
            <div className="text-lg font-bold text-slate-800 mb-4">
              Expert rheumatology care for better joint health.
            </div>
            {attributes.about_text && (
              <p className="text-sm text-slate-600 mb-4">
                {attributes.about_text.length > 150 
                  ? `${attributes.about_text.substring(0, 150)}...` 
                  : attributes.about_text}
              </p>
            )}
          </div>

          {/* 2nd block - Services */}
          <div className="sm:col-span-6 md:col-span-3 lg:col-span-2">
            <h6 className="text-sm text-slate-800 font-semibold mb-2">Our Services</h6>
            <ul className="text-sm font-medium space-y-2">
              {attributes.services && attributes.services.length > 0 ? (
                attributes.services.slice(0, 5).map((service, index) => (
                  <li key={index}>
                    <a href="#services" className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out">
                      {service}
                    </a>
                  </li>
                ))
              ) : (
                <>
                  <li>
                    <a href="#services" className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out">
                      Arthritis Treatment
                    </a>
                  </li>
                  <li>
                    <a href="#services" className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out">
                      Autoimmune Disorders
                    </a>
                  </li>
                  <li>
                    <a href="#services" className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out">
                      Infusion Therapy
                    </a>
                  </li>
                  <li>
                    <a href="#services" className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out">
                      Joint Injections
                    </a>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* 3rd block - Quick Links */}
          <div className="sm:col-span-6 md:col-span-3 lg:col-span-2">
            <h6 className="text-sm text-slate-800 font-semibold mb-2">Quick Links</h6>
            <ul className="text-sm font-medium space-y-2">
              <li>
                <a href="#about" className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out">
                  About Us
                </a>
              </li>
              <li>
                <a href="#providers" className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out">
                  Our Team
                </a>
              </li>
              <li>
                <a href="#appointment" className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out">
                  Schedule Appointment
                </a>
              </li>
              <li>
                <a href="#contact" className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out">
                  Contact Us
                </a>
              </li>
            </ul>
          </div>

          {/* 4th block - Contact Info */}
          <div className="sm:col-span-6 md:col-span-3 lg:col-span-2">
            <h6 className="text-sm text-slate-800 font-semibold mb-2">Contact Info</h6>
            <ul className="text-sm font-medium space-y-2">
              {attributes.phone && (
                <li>
                  <a 
                    href={`tel:${attributes.phone}`} 
                    className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out"
                  >
                    {attributes.phone}
                  </a>
                </li>
              )}
              {attributes.email && (
                <li>
                  <a 
                    href={`mailto:${attributes.email}`} 
                    className="text-slate-500 hover:text-blue-600 transition duration-150 ease-in-out"
                  >
                    {attributes.email}
                  </a>
                </li>
              )}
              {attributes.address_line1 && (
                <li className="text-slate-500">
                  {attributes.address_line1}
                  {attributes.address_line2 && <><br />{attributes.address_line2}</>}
                  {(attributes.city || attributes.state || attributes.zip_code) && (
                    <><br />
                      {attributes.city}{attributes.city && attributes.state && ', '}{attributes.state} {attributes.zip_code}
                    </>
                  )}
                </li>
              )}
            </ul>
          </div>

          {/* 5th block - Insurance */}
          {attributes.insurance_accepted && attributes.insurance_accepted.length > 0 && (
            <div className="sm:col-span-6 md:col-span-3 lg:col-span-2">
              <h6 className="text-sm text-slate-800 font-semibold mb-2">Insurance Accepted</h6>
              <ul className="text-sm font-medium space-y-2">
                {attributes.insurance_accepted.slice(0, 4).map((insurance, index) => (
                  <li key={index} className="text-slate-500">
                    {insurance}
                  </li>
                ))}
                {attributes.insurance_accepted.length > 4 && (
                  <li className="text-slate-500">
                    ...and {attributes.insurance_accepted.length - 4} more
                  </li>
                )}
              </ul>
            </div>
          )}

        </div>

        {/* Bottom area */}
        <div className="md:flex md:items-center md:justify-between py-6 md:py-8 border-t border-slate-200">

          {/* Social links - placeholder for future implementation */}
          <ul className="flex space-x-6 mb-4 md:order-1 md:ml-4 md:mb-0">
            <li>
              <a 
                className="text-blue-500 hover:text-blue-600 transition duration-150 ease-in-out" 
                href="#" 
                aria-label="Facebook"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 10.025C20 4.491 15.52 0 10 0S0 4.491 0 10.025c0 4.852 3.44 8.892 8 9.825v-6.817H6v-3.008h2V7.52a3.508 3.508 0 0 1 3.5-3.509H14v3.008h-2c-.55 0-1 .45-1 1.002v2.005h3v3.008h-3V20c5.05-.501 9-4.772 9-9.975Z" />
                </svg>
              </a>
            </li>
            <li>
              <a 
                className="text-blue-500 hover:text-blue-600 transition duration-150 ease-in-out" 
                href="#" 
                aria-label="LinkedIn"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.6 0H1.4C.6 0 0 .6 0 1.4v17.1C0 19.4.6 20 1.4 20h17.1c.8 0 1.4-.6 1.4-1.4V1.4C20 .6 19.4 0 18.6 0zM6 17H3V8h3v9zM4.5 6.3c-1 0-1.8-.8-1.8-1.8s.8-1.8 1.8-1.8 1.8.8 1.8 1.8-.8 1.8-1.8 1.8zM17 17h-3v-4.4c0-1.1 0-2.5-1.5-2.5s-1.7 1.2-1.7 2.4V17H8V8h2.9v1.2h.1c.4-.8 1.4-1.7 2.9-1.7 3.1 0 3.7 2 3.7 4.7V17h.4z"/>
                </svg>
              </a>
            </li>
            <li>
              <a 
                className="text-blue-500 hover:text-blue-600 transition duration-150 ease-in-out" 
                href="#" 
                aria-label="Google"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.6 10.2c0-.7-.1-1.4-.2-2H10v3.8h5.4c-.2 1.2-.9 2.3-1.9 3v2.5h3.1c1.8-1.7 2.8-4.1 2.8-7.1l.2-.2z"/>
                  <path d="M10 20c2.6 0 4.7-.9 6.3-2.4l-3.1-2.4c-.9.6-2 1-3.2 1-2.4 0-4.5-1.6-5.2-3.9H1.6v2.5C3.2 17.5 6.4 20 10 20z"/>
                  <path d="M4.8 11.3c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8V5.2H1.6C.6 7.1 0 8.5 0 10s.6 2.9 1.6 4.8l3.2-2.5z"/>
                  <path d="M10 4c1.4 0 2.6.5 3.6 1.4l2.7-2.7C14.7 1.1 12.4 0 10 0 6.4 0 3.2 2.5 1.6 6.2l3.2 2.5C5.5 5.6 7.6 4 10 4z"/>
                </svg>
              </a>
            </li>
          </ul>

          {/* Copyright */}
          <div className="text-sm text-slate-500 mr-4">
            © {currentYear} {practice.name}. All rights reserved. | Professional rheumatology care.
          </div>

        </div>

      </div>
    </footer>
  );
}
