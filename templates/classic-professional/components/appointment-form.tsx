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
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: data.first_name,
          lastName: data.last_name,
          email: data.email,
          phone: data.phone,
          preferredDate: data.preferred_date,
          preferredTime: data.preferred_time,
          reason: data.reason,
          message: data.message,
          practiceEmail: 'appointments@practice.com' // This should be configurable per practice
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit appointment request');
      }

      setIsSubmitted(true);
      reset();
    } catch (error) {
      console.error('Error submitting appointment request:', error);
      // TODO: Show error message to user
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="border rounded-lg p-6 text-center bg-practice-primary-50 border-practice-primary">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-practice-primary-100">
          <span className="text-2xl text-practice-primary">✓</span>
        </div>
        <h3 className="text-lg font-semibold mb-2 text-practice-primary">
          Appointment Request Submitted
        </h3>
        <p className="text-practice-primary">
          Thank you! We'll contact you within 24 hours to confirm your appointment.
        </p>
        <button
          type="button"
          onClick={() => setIsSubmitted(false)}
          className="mt-4 font-medium transition-colors hover:opacity-80 text-practice-primary"
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
          className="w-full py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-practice-primary text-white"
        >
          {isSubmitting ? 'Submitting...' : 'Request Appointment'}
        </button>
      </form>
    </div>
  );
}
