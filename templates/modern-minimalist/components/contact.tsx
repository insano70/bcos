import type { Practice, PracticeAttributes } from '@/lib/types/practice';
import { parseBusinessHours, parseInsurance } from '@/lib/utils/json-parser';
import { formatBusinessHours } from '@/lib/utils/business-hours-formatter';

interface ContactProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles: any;
}

export default function Contact({ practice, attributes, colorStyles }: ContactProps) {

  return (
    <section id="contact" className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4">
            Visit Us
          </h2>
          <p className="text-lg text-gray-600 font-light">
            Modern facility, convenient location
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Contact Information */}
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-light text-gray-900 mb-4">Contact</h3>
              <div className="space-y-3">
                {attributes.phone && (
                  <p className="text-gray-600 font-light">
                    <span className="inline-block w-16">Phone:</span>
                    <a href={`tel:${attributes.phone}`} className="hover:text-gray-900 transition-colors">
                      {attributes.phone}
                    </a>
                  </p>
                )}
                {attributes.email && (
                  <p className="text-gray-600 font-light">
                    <span className="inline-block w-16">Email:</span>
                    <a href={`mailto:${attributes.email}`} className="hover:text-gray-900 transition-colors">
                      {attributes.email}
                    </a>
                  </p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-light text-gray-900 mb-4">Address</h3>
              <div className="text-gray-600 font-light space-y-1">
                {attributes.address_line1 && <p>{attributes.address_line1}</p>}
                {attributes.address_line2 && <p>{attributes.address_line2}</p>}
                {(attributes.city || attributes.state || attributes.zip_code) && (
                  <p>
                    {attributes.city && `${attributes.city}, `}
                    {attributes.state && `${attributes.state} `}
                    {attributes.zip_code}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Business Hours */}
          <div>
            <h3 className="text-lg font-light text-gray-900 mb-4">Hours</h3>
            <div className="space-y-2">
              {attributes.business_hours ? (
                formatBusinessHours(parseBusinessHours(attributes.business_hours)).map((dayInfo) => (
                  <div key={dayInfo.day} className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600 font-light">
                      {dayInfo.day}
                    </span>
                    <span className={`font-light ${dayInfo.isClosed ? 'text-gray-500 italic' : 'text-gray-900'}`}>
                      {dayInfo.hours}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-gray-600 font-light">Please call for current hours</p>
              )}
            </div>
          </div>

          {/* Insurance */}
          <div>
            <h3 className="text-lg font-light text-gray-900 mb-4">Insurance</h3>
            <div className="text-gray-600 font-light">
              <ul className="space-y-1">
                {parseInsurance(attributes.insurance_accepted).map((insurance: string, index: number) => (
                  <li key={index}>• {insurance}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
