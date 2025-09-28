'use client';

import { useForm } from 'react-hook-form';
import { useState } from 'react';

interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}

interface ContactFormProps {
  colorStyles?: any;
  practiceEmail?: string;
}

export default function ContactForm({ colorStyles, practiceEmail = 'contact@practice.com' }: ContactFormProps) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>();

  const onSubmit = async (data: ContactFormData) => {
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone,
          subject: data.subject,
          message: data.message,
          practiceEmail: practiceEmail
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit contact form');
      }

      setIsSubmitted(true);
      reset();
    } catch (error) {
      console.error('Error submitting contact form:', error);
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
          Message Sent Successfully
        </h3>
        <p className="text-practice-primary">
          Thank you for contacting us! We'll get back to you within 24 hours.
        </p>
        <button
          type="button"
          onClick={() => setIsSubmitted(false)}
          className="mt-4 font-medium transition-colors hover:opacity-80 text-practice-primary"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-6">Send us a Message</h3>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Full Name *
          </label>
          <input
            type="text"
            {...register('name', { required: 'Name is required' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:border-opacity-70"
            style={{ 
              '--tw-ring-color': colorStyles?.primary?.backgroundColor || '#2563eb',
              '--tw-border-opacity': '0.7'
            } as React.CSSProperties}
          />
          {errors.name && (
            <p className="text-red-600 text-sm mt-1">{errors.name.message}</p>
          )}
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
              Phone Number
            </label>
            <input
              type="tel"
              {...register('phone')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:border-opacity-70"
              style={{ 
                '--tw-ring-color': colorStyles?.primary?.backgroundColor || '#2563eb',
                '--tw-border-opacity': '0.7'
              } as React.CSSProperties}
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subject *
          </label>
          <select
            {...register('subject', { required: 'Subject is required' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a subject</option>
            <option value="appointment">Appointment Inquiry</option>
            <option value="insurance">Insurance Questions</option>
            <option value="billing">Billing Question</option>
            <option value="medical-records">Medical Records Request</option>
            <option value="referral">Referral Question</option>
            <option value="general">General Inquiry</option>
            <option value="other">Other</option>
          </select>
          {errors.subject && (
            <p className="text-red-600 text-sm mt-1">{errors.subject.message}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message *
          </label>
          <textarea
            {...register('message', { required: 'Message is required' })}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Please provide details about your inquiry..."
          />
          {errors.message && (
            <p className="text-red-600 text-sm mt-1">{errors.message.message}</p>
          )}
        </div>
        
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-practice-primary text-white"
        >
          {isSubmitting ? 'Sending...' : 'Send Message'}
        </button>
      </form>
    </div>
  );
}
