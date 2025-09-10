import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface ContactProps {
  practice: Practice;
  attributes: PracticeAttributes;
}

export default function Contact({ practice, attributes }: ContactProps) {
  return (
    <section id="contact" className="py-20 bg-amber-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-serif text-amber-900 mb-4">
            We're Here for You
          </h2>
          <p className="text-lg text-amber-800">
            Reach out anytime - we're always happy to help
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="bg-white p-8 rounded-3xl shadow-lg">
            <h3 className="text-2xl font-serif text-amber-900 mb-6">Get in Touch</h3>
            <div className="space-y-4">
              {attributes.phone && (
                <div className="flex items-center">
                  <span className="text-2xl mr-4">📞</span>
                  <a href={`tel:${attributes.phone}`} className="text-amber-800 hover:text-amber-900 text-lg">
                    {attributes.phone}
                  </a>
                </div>
              )}
              {attributes.email && (
                <div className="flex items-center">
                  <span className="text-2xl mr-4">✉️</span>
                  <a href={`mailto:${attributes.email}`} className="text-amber-800 hover:text-amber-900 text-lg">
                    {attributes.email}
                  </a>
                </div>
              )}
              {attributes.address_line1 && (
                <div className="flex items-start">
                  <span className="text-2xl mr-4 mt-1">📍</span>
                  <div className="text-amber-800 text-lg">
                    <p>{attributes.address_line1}</p>
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
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-lg">
            <h3 className="text-2xl font-serif text-amber-900 mb-6">Office Hours</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-amber-100">
                <span className="text-amber-800">Monday - Friday</span>
                <span className="text-amber-900 font-medium">8:00 AM - 5:00 PM</span>
              </div>
              <div className="flex justify-between py-2 border-b border-amber-100">
                <span className="text-amber-800">Saturday</span>
                <span className="text-amber-900 font-medium">By Appointment</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-amber-800">Sunday</span>
                <span className="text-amber-900 font-medium">Closed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
