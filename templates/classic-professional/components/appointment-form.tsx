'use client';

import { useForm } from 'react-hook-form';
import { useState } from 'react';

interface AppointmentFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  preferred_date: string;
  preferred_time: string;
  reason: string;
  message: string;
}

export default function AppointmentForm({ colorStyles }: { colorStyles?: any }) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AppointmentFormData>();

  const onSubmit = async (data: AppointmentFormData) => {
    setIsSubmitting(true);
    
    try {
      // TODO: Implement API endpoint for appointment requests
      console.log('Appointment request:', data);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setIsSubmitted(true);
      reset();
    } catch (error) {
      console.error('Error submitting appointment request:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="border rounded-lg p-6 text-center" style={{ ...(colorStyles?.primaryBg50 || { backgroundColor: '#f0f9ff' }), borderColor: colorStyles?.primary?.backgroundColor || '#2563eb' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={colorStyles?.primaryBg100 || { backgroundColor: '#dbeafe' }}>
          <span className="text-2xl" style={colorStyles?.primaryText || { color: '#2563eb' }}>✓</span>
        </div>
        <h3 className="text-lg font-semibold mb-2" style={colorStyles?.primaryText || { color: '#2563eb' }}>
          Appointment Request Submitted
        </h3>
        <p style={colorStyles?.primaryText || { color: '#2563eb' }}>
          Thank you! We'll contact you within 24 hours to confirm your appointment.
        </p>
        <button
          type="button"
          onClick={() => setIsSubmitted(false)}
          className="mt-4 font-medium transition-colors hover:opacity-80"
          style={colorStyles?.primaryText || { color: '#2563eb' }}
        >
          Submit Another Request
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-6">Request an Appointment</h3>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              First Name *
            </label>
            <input
              type="text"
              {...register('first_name', { required: 'First name is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:border-opacity-70"
              style={{ 
                '--tw-ring-color': colorStyles?.primary?.backgroundColor || '#2563eb',
                '--tw-border-opacity': '0.7'
              } as React.CSSProperties}
            />
            {errors.first_name && (
              <p className="text-red-600 text-sm mt-1">{errors.first_name.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Last Name *
            </label>
            <input
              type="text"
              {...register('last_name', { required: 'Last name is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:border-opacity-70"
              style={{ 
                '--tw-ring-color': colorStyles?.primary?.backgroundColor || '#2563eb',
                '--tw-border-opacity': '0.7'
              } as React.CSSProperties}
            />
            {errors.last_name && (
              <p className="text-red-600 text-sm mt-1">{errors.last_name.message}</p>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email *
            </label>
            <input
              type="email"
              {...register('email', { required: 'Email is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:border-opacity-70"
              style={{ 
                '--tw-ring-color': colorStyles?.primary?.backgroundColor || '#2563eb',
                '--tw-border-opacity': '0.7'
              } as React.CSSProperties}
            />
            {errors.email && (
              <p className="text-red-600 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number *
            </label>
            <input
              type="tel"
              {...register('phone', { required: 'Phone number is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:border-opacity-70"
              style={{ 
                '--tw-ring-color': colorStyles?.primary?.backgroundColor || '#2563eb',
                '--tw-border-opacity': '0.7'
              } as React.CSSProperties}
            />
            {errors.phone && (
              <p className="text-red-600 text-sm mt-1">{errors.phone.message}</p>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preferred Date
            </label>
            <input
              type="date"
              {...register('preferred_date')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:border-opacity-70"
              style={{ 
                '--tw-ring-color': colorStyles?.primary?.backgroundColor || '#2563eb',
                '--tw-border-opacity': '0.7'
              } as React.CSSProperties}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preferred Time
            </label>
            <select
              {...register('preferred_time')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:border-opacity-70"
              style={{ 
                '--tw-ring-color': colorStyles?.primary?.backgroundColor || '#2563eb',
                '--tw-border-opacity': '0.7'
              } as React.CSSProperties}
            >
              <option value="">Select a time</option>
              <option value="morning">Morning (8:00 AM - 12:00 PM)</option>
              <option value="afternoon">Afternoon (12:00 PM - 5:00 PM)</option>
              <option value="anytime">Anytime</option>
            </select>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reason for Visit
          </label>
          <select
            {...register('reason')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a reason</option>
            <option value="new-patient">New Patient Consultation</option>
            <option value="follow-up">Follow-up Appointment</option>
            <option value="joint-pain">Joint Pain</option>
            <option value="arthritis">Arthritis Concerns</option>
            <option value="lupus">Lupus Management</option>
            <option value="infusion">Infusion Therapy</option>
            <option value="second-opinion">Second Opinion</option>
            <option value="other">Other</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Additional Message
          </label>
          <textarea
            {...register('message')}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Please describe your symptoms or concerns..."
          />
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={colorStyles?.primary || { backgroundColor: '#2563eb', color: 'white' }}
        >
          {isSubmitting ? 'Submitting...' : 'Request Appointment'}
        </button>
      </form>
    </div>
  );
}
