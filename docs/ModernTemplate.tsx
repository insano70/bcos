import React from 'react';
import { Phone, Mail, MapPin, Clock, Users, Award, Heart, Star, Shield, Calendar } from 'lucide-react';
import { Practice } from '../../types/Practice';

interface ModernTemplateProps {
  practice: Practice;
}

export const ModernTemplate: React.FC<ModernTemplateProps> = ({ practice }) => {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: practice.colors.primary }}
              >
                <Heart className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{practice.name}</h1>
                <p className="text-sm text-gray-600">{practice.specialty}</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-6">
              <div className="flex items-center space-x-2 text-gray-600">
                <Phone className="h-4 w-4" />
                <span className="text-sm">{practice.contact.phone}</span>
              </div>
              <button 
                className="px-6 py-2 rounded-lg text-white font-medium transition-colors duration-200 hover:opacity-90"
                style={{ backgroundColor: practice.colors.primary }}
              >
                Schedule Appointment
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section 
        className="relative h-96 flex items-center justify-center text-white"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url(${practice.bannerImage || practice.heroImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="text-center max-w-4xl mx-auto px-4">
          <h1 className="text-5xl font-bold mb-4">{practice.tagline}</h1>
          <p className="text-xl mb-8 opacity-90">{practice.description}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              className="px-8 py-3 rounded-lg text-white font-medium text-lg transition-all duration-200 hover:scale-105"
              style={{ backgroundColor: practice.colors.primary }}
            >
              Book Your Consultation
            </button>
            <button className="px-8 py-3 rounded-lg bg-white text-gray-900 font-medium text-lg transition-all duration-200 hover:scale-105">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: practice.colors.primary + '20' }}
              >
                <Star className="h-8 w-8" style={{ color: practice.colors.primary }} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">5-Star Care</h3>
              <p className="text-gray-600">Consistently rated excellent by our patients</p>
            </div>
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: practice.colors.secondary + '20' }}
              >
                <Shield className="h-8 w-8" style={{ color: practice.colors.secondary }} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Board Certified</h3>
              <p className="text-gray-600">All physicians are board certified specialists</p>
            </div>
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: practice.colors.accent + '20' }}
              >
                <Calendar className="h-8 w-8" style={{ color: practice.colors.accent }} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Same Day Appointments</h3>
              <p className="text-gray-600">Often available for urgent care needs</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Services</h2>
            <p className="text-lg text-gray-600">Comprehensive medical care tailored to your needs</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {practice.services.map((service, index) => (
              <div key={index} className="bg-gray-50 p-6 rounded-lg hover:shadow-lg transition-shadow duration-200">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: practice.colors.secondary + '20' }}
                >
                  <Award 
                    className="h-6 w-6"
                    style={{ color: practice.colors.secondary }}
                  />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{service.name}</h3>
                <p className="text-gray-600">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Doctors Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Meet Our Doctors</h2>
            <p className="text-lg text-gray-600">Experienced healthcare professionals dedicated to your wellbeing</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {practice.doctors
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((doctor, index) => (
              <div key={index} className="bg-white p-8 rounded-lg shadow-md">
                <div className="flex items-start space-x-6">
                  <img 
                    src={doctor.image} 
                    alt={doctor.name}
                    className="w-24 h-24 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-1">{doctor.name}</h3>
                    <p 
                      className="font-medium mb-3"
                      style={{ color: practice.colors.primary }}
                    >
                      {doctor.title}
                    </p>
                    <p className="text-gray-600">{doctor.bio}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact & Hours Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Contact Us</h2>
              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <MapPin 
                    className="h-6 w-6 mt-1"
                    style={{ color: practice.colors.primary }}
                  />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Address</h3>
                    <p className="text-gray-600">
                      {practice.contact.address.street}<br />
                      {practice.contact.address.city}, {practice.contact.address.state} {practice.contact.address.zip}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <Phone 
                    className="h-6 w-6 mt-1"
                    style={{ color: practice.colors.primary }}
                  />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Phone</h3>
                    <p className="text-gray-600">{practice.contact.phone}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <Mail 
                    className="h-6 w-6 mt-1"
                    style={{ color: practice.colors.primary }}
                  />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Email</h3>
                    <p className="text-gray-600">{practice.contact.email}</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Office Hours</h2>
              <div className="bg-gray-50 p-6 rounded-lg">
                <div className="flex items-center space-x-3 mb-4">
                  <Clock 
                    className="h-6 w-6"
                    style={{ color: practice.colors.primary }}
                  />
                  <h3 className="font-semibold text-gray-900">Weekly Schedule</h3>
                </div>
                <div className="space-y-2">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                    <div key={day} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
                      <span className="font-medium text-gray-900">{day}</span>
                      <span className="text-gray-600">{practice.hours[day] || 'Closed'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer 
        className="text-white py-12"
        style={{ backgroundColor: practice.colors.primary }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <Heart className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold">{practice.name}</h3>
                <p className="text-sm opacity-90">{practice.specialty}</p>
              </div>
            </div>
            <p className="text-sm opacity-75">© 2024 {practice.name}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};