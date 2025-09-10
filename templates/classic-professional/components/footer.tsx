import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface FooterProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Footer({ practice, attributes, colorStyles }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="text-white py-16" style={{ backgroundColor: colorStyles?.primary?.backgroundColor || '#1f2937' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Practice info */}
          <div className="md:col-span-2">
            <h3 className="text-2xl font-bold mb-4">{practice.name}</h3>
            {attributes.mission_statement && (
              <p className="text-gray-300 mb-4 max-w-md">
                {attributes.mission_statement}
              </p>
            )}
            
            {/* Contact info */}
            <div className="space-y-2">
              {attributes.phone && (
                <p className="text-gray-300">
                  <span className="font-semibold">Phone:</span> {attributes.phone}
                </p>
              )}
              {attributes.email && (
                <p className="text-gray-300">
                  <span className="font-semibold">Email:</span> {attributes.email}
                </p>
              )}
            </div>
          </div>
          
          {/* Quick links */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <a href="#about" className="text-gray-300 hover:text-white transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="#services" className="text-gray-300 hover:text-white transition-colors">
                  Services
                </a>
              </li>
              <li>
                <a href="#providers" className="text-gray-300 hover:text-white transition-colors">
                  Our Providers
                </a>
              </li>
              <li>
                <a href="#contact" className="text-gray-300 hover:text-white transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          
          {/* Address */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Location</h4>
            {(attributes.address_line1 || attributes.city) && (
              <div className="text-gray-300 space-y-1">
                {attributes.address_line1 && <p>{attributes.address_line1}</p>}
                {attributes.address_line2 && <p>{attributes.address_line2}</p>}
                {(attributes.city || attributes.state || attributes.zip_code) && (
                  <p>
                    {attributes.city}, {attributes.state} {attributes.zip_code}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Bottom bar */}
        <div className="border-t border-gray-700 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © {currentYear} {practice.name}. All rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
              Terms of Service
            </a>
            <a href="#" className="text-gray-400 hover:text-white text-sm transition-colors">
              HIPAA Notice
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
