import type { Practice, PracticeAttributes } from '@/lib/types/practice';

interface AppointmentFormProps {
  practice: Practice;
  attributes: PracticeAttributes;
  colorStyles?: any;
}

export default function AppointmentForm({ practice, attributes, colorStyles }: AppointmentFormProps) {
  return (
    <section id="appointment" className="relative">

      {/* Dark background */}
      <div className="absolute inset-0 bg-slate-900 pointer-events-none -z-10 h-1/3 lg:h-2/3" aria-hidden="true"></div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <div className="py-12 md:py-20">

          {/* Section header */}
          <div className="max-w-3xl mx-auto text-center pb-12">
            <h2 className="h2 font-playfair-display text-slate-100">
              Schedule Your Consultation
            </h2>
            <p className="text-xl text-slate-400 mt-4">
              Take the first step towards better joint health. Our team is here to help you find relief and improve your quality of life.
            </p>
          </div>

          {/* Form container */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-xl p-8 animate-fade-up">
              
              <form className="space-y-6">
                
                {/* Name fields */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 mb-2">
                      First Name *
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      name="firstName"
                      required
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder="Your first name"
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 mb-2">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      name="lastName"
                      required
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder="Your last name"
                    />
                  </div>
                </div>

                {/* Contact fields */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder="your.email@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-2">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      required
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>

                {/* Appointment preferences */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="appointmentType" className="block text-sm font-medium text-slate-700 mb-2">
                      Appointment Type
                    </label>
                    <select
                      id="appointmentType"
                      name="appointmentType"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    >
                      <option value="">Select appointment type</option>
                      <option value="new-patient">New Patient Consultation</option>
                      <option value="follow-up">Follow-up Visit</option>
                      <option value="injection">Joint Injection</option>
                      <option value="infusion">Infusion Therapy</option>
                      <option value="second-opinion">Second Opinion</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="preferredDate" className="block text-sm font-medium text-slate-700 mb-2">
                      Preferred Date
                    </label>
                    <input
                      type="date"
                      id="preferredDate"
                      name="preferredDate"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    />
                  </div>
                </div>

                {/* Insurance */}
                <div>
                  <label htmlFor="insurance" className="block text-sm font-medium text-slate-700 mb-2">
                    Insurance Provider
                  </label>
                  <input
                    type="text"
                    id="insurance"
                    name="insurance"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    placeholder="Your insurance provider"
                  />
                </div>

                {/* Reason for visit */}
                <div>
                  <label htmlFor="reason" className="block text-sm font-medium text-slate-700 mb-2">
                    Reason for Visit
                  </label>
                  <textarea
                    id="reason"
                    name="reason"
                    rows={4}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                    placeholder="Please describe your symptoms or the reason for your visit..."
                  ></textarea>
                </div>

                {/* Current medications */}
                <div>
                  <label htmlFor="medications" className="block text-sm font-medium text-slate-700 mb-2">
                    Current Medications
                  </label>
                  <textarea
                    id="medications"
                    name="medications"
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                    placeholder="Please list any medications you're currently taking..."
                  ></textarea>
                </div>

                {/* Consent */}
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="consent"
                    name="consent"
                    required
                    className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="consent" className="text-sm text-slate-600">
                    I consent to receive communication from {practice.name} regarding my appointment request and treatment. 
                    I understand that this form is not for medical emergencies.
                  </label>
                </div>

                {/* Submit button */}
                <div className="text-center">
                  <button
                    type="submit"
                    className="btn text-white px-8 py-4 text-lg group bg-practice-primary"
                  >
                    Request Appointment
                    <span className="tracking-normal text-blue-300 group-hover:translate-x-0.5 transition-transform duration-150 ease-in-out ml-1">
                      →
                    </span>
                  </button>
                </div>

              </form>

              {/* Contact info */}
              <div className="mt-8 pt-6 border-t border-slate-200 text-center">
                <p className="text-sm text-slate-600 mb-2">
                  Need immediate assistance or have questions?
                </p>
                <div className="flex justify-center space-x-6">
                  {attributes.phone && (
                    <a 
                      href={`tel:${attributes.phone}`}
                      className="text-sm font-medium hover:text-blue-600 transition-colors text-practice-primary"
                    >
                      Call {attributes.phone}
                    </a>
                  )}
                  {attributes.email && (
                    <a 
                      href={`mailto:${attributes.email}`}
                      className="text-sm font-medium hover:text-blue-600 transition-colors text-practice-primary"
                    >
                      Email Us
                    </a>
                  )}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
