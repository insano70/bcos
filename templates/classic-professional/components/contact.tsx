import type { Practice, PracticeAttributes } from '@/lib/types/practice';
import { parseBusinessHours, parseInsurance } from '@/lib/utils/json-parser';

interface ContactProps {
  practice: Practice;
  attributes: PracticeAttributes;
}

export default function Contact({ practice, attributes }: ContactProps) {
  const formatBusinessHours = (hours: any) => {
    if (!hours) return null;
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    return days.map((day, index) => {
      const schedule = hours[day];
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
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Contact Information */}
          <div className="bg-white rounded-lg shadow-sm p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Get In Touch</h3>
            
            {attributes.phone && (
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-blue-600">📞</span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <a href={`tel:${attributes.phone}`} className="text-blue-600 font-semibold hover:text-blue-700">
                    {attributes.phone}
                  </a>
                </div>
              </div>
            )}
            
            {attributes.email && (
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-blue-600">✉️</span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <a href={`mailto:${attributes.email}`} className="text-blue-600 font-semibold hover:text-blue-700">
                    {attributes.email}
                  </a>
                </div>
              </div>
            )}
            
            {(attributes.address_line1 || attributes.city) && (
              <div className="flex items-start">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-blue-600">📍</span>
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
              {attributes.business_hours ? (
                formatBusinessHours(attributes.business_hours)
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
                  <div key={index} className="flex items-center">
                    <span className="w-2 h-2 bg-blue-600 rounded-full mr-3"></span>
                    <span className="text-gray-700">{insurance}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-600 mt-4">
                Don't see your insurance? Please contact us to verify coverage.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
