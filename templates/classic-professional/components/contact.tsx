import type { Practice, PracticeAttributes, ColorStyles, BusinessHours, DaySchedule } from '@/lib/types/practice';
import { parseBusinessHours, parseInsurance } from '@/lib/utils/json-parser';
import { formatBusinessHours } from '@/lib/utils/business-hours-formatter';
import ContactForm from './contact-form';

interface BusinessHourInfo {
  day: string;
  hours: string;
  isClosed: boolean;
}

interface ContactProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: ColorStyles;
}

export default function Contact({ practice, attributes, colorStyles }: ContactProps) {
  const renderBusinessHoursJSX = (hours: BusinessHours | null) => {
    if (!hours) return null;
    
    const days: (keyof BusinessHours)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    return days.map((day, index) => {
      const schedule: DaySchedule | undefined = hours[day];
      if (!schedule) return null;
      
      return (
        <div key={day} className="flex justify-between py-1">
          <span className="font-medium">{dayNames[index]}:</span>
          <span className="text-gray-600">
            {schedule.closed ? 'Closed' : `${schedule.open} - ${schedule.close}`}
          </span>
        </div>
      );
    });
  };

  return (
    <section id="contact" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Contact Us
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Ready to take the next step? Contact us to schedule your appointment.
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-12">
          {/* Contact Information */}
          <div className="bg-white rounded-lg shadow-sm p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Get In Touch</h3>
            
            {attributes.phone && (
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mr-4 bg-practice-primary-100">
                  <span className="text-practice-primary">📞</span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <a href={`tel:${attributes.phone}`} className="font-semibold transition-colors hover:opacity-80 text-practice-primary">
                    {attributes.phone}
                  </a>
                </div>
              </div>
            )}
            
            {attributes.email && (
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mr-4 bg-practice-primary-100">
                  <span className="text-practice-primary">✉️</span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <a href={`mailto:${attributes.email}`} className="font-semibold transition-colors hover:opacity-80 text-practice-primary">
                    {attributes.email}
                  </a>
                </div>
              </div>
            )}
            
            {(attributes.address_line1 || attributes.city) && (
              <div className="flex items-start">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mr-4 bg-practice-primary-100">
                  <span className="text-practice-primary">📍</span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Address</p>
                  <div className="text-gray-900">
                    {attributes.address_line1 && <p>{attributes.address_line1}</p>}
                    {attributes.address_line2 && <p>{attributes.address_line2}</p>}
                    {(attributes.city || attributes.state || attributes.zip_code) && (
                      <p>
                        {attributes.city}, {attributes.state} {attributes.zip_code}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Business Hours */}
          <div className="bg-white rounded-lg shadow-sm p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Office Hours</h3>
            <div className="space-y-2">
              {(() => {
                const parsed = parseBusinessHours(attributes.business_hours);
                const formatted = formatBusinessHours(parsed);
                return formatted;
              })().length > 0 ? (
                <div className="space-y-1">
                  {formatBusinessHours(parseBusinessHours(attributes.business_hours))
                    .map((dayInfo: BusinessHourInfo, index: number) => (
                      <div key={`${dayInfo.day}-${index}`} className="flex justify-between items-center py-1">
                        <span className="text-gray-900 font-medium">{dayInfo.day}</span>
                        <span className={`text-sm ${dayInfo.isClosed ? 'text-gray-500 italic' : 'text-gray-700'}`}>
                          {dayInfo.hours}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-gray-600">Please call for current hours</p>
              )}
            </div>
          </div>
          
          {/* Insurance */}
          {attributes.insurance_accepted && attributes.insurance_accepted.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Insurance Accepted</h3>
              <div className="space-y-2">
                {attributes.insurance_accepted.map((insurance, index) => (
                  <div key={`insurance-${index}-${insurance.replace(/\s+/g, '-').toLowerCase()}`} className="flex items-center">
                    <span className="w-2 h-2 rounded-full mr-3 bg-practice-primary"></span>
                    <span className="text-gray-700">{insurance}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-600 mt-4">
                Don't see your insurance? Please contact us to verify coverage.
              </p>
            </div>
          )}

          {/* Contact Form */}
          <div className="lg:col-span-2 xl:col-span-1">
            <ContactForm practice={practice} attributes={attributes} colorStyles={colorStyles} />
          </div>
        </div>
      </div>
    </section>
  );
}
