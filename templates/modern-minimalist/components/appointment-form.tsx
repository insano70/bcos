'use client';

import { useState } from 'react';

export default function AppointmentForm() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    preferredDate: '',
    preferredTime: '',
    reason: '',
    message: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (isSubmitted) {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <div className="bg-green-50 border border-green-200 p-8">
          <div className="text-green-600 text-4xl mb-4">✓</div>
          <h3 className="text-xl font-light text-gray-900 mb-2">
            Request Received
          </h3>
          <p className="text-gray-600 font-light">
            Thank you for your appointment request. We'll contact you within 24 hours to confirm your visit.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="appointment" className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="firstName" className="block text-sm text-gray-700 mb-2">
              First Name *
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              required
              value={formData.firstName}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>
          
          <div>
            <label htmlFor="lastName" className="block text-sm text-gray-700 mb-2">
              Last Name *
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              required
              value={formData.lastName}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="email" className="block text-sm text-gray-700 mb-2">
              Email *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>
          
          <div>
            <label htmlFor="phone" className="block text-sm text-gray-700 mb-2">
              Phone *
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              required
              value={formData.phone}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="preferredDate" className="block text-sm text-gray-700 mb-2">
              Preferred Date
            </label>
            <input
              type="date"
              id="preferredDate"
              name="preferredDate"
              value={formData.preferredDate}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors"
            />
          </div>
          
          <div>
            <label htmlFor="preferredTime" className="block text-sm text-gray-700 mb-2">
              Preferred Time
            </label>
            <select
              id="preferredTime"
              name="preferredTime"
              value={formData.preferredTime}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors"
            >
              <option value="">Select time</option>
              <option value="morning">Morning (8:00 AM - 12:00 PM)</option>
              <option value="afternoon">Afternoon (12:00 PM - 5:00 PM)</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="reason" className="block text-sm text-gray-700 mb-2">
            Reason for Visit
          </label>
          <select
            id="reason"
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            className="w-full px-4 py-3 border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors"
          >
            <option value="">Select reason</option>
            <option value="new-patient">New Patient Consultation</option>
            <option value="follow-up">Follow-up Appointment</option>
            <option value="joint-pain">Joint Pain</option>
            <option value="arthritis">Arthritis Management</option>
            <option value="lupus">Lupus Care</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="message" className="block text-sm text-gray-700 mb-2">
            Additional Information
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            value={formData.message}
            onChange={handleChange}
            placeholder="Please describe your symptoms or any additional information..."
            className="w-full px-4 py-3 border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-gray-900 text-white px-8 py-4 font-light hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Submitting...' : 'Request Appointment'}
        </button>
      </form>
    </div>
  );
}
