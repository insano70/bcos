import type { TemplateProps } from '@/lib/types/practice';
import Head from 'next/head';
import { getColorStyles, getTemplateDefaultColors } from '@/lib/utils/color-utils';

export default function CommunityPracticeTemplate({ 
  practice, 
  attributes, 
  staff,
  colorStyles 
}: TemplateProps) {
  // Generate color styles if not provided
  const defaultColors = getTemplateDefaultColors('community-practice');
  const brandColors = {
    primary: attributes.primary_color || defaultColors.primary,
    secondary: attributes.secondary_color || defaultColors.secondary,
    accent: attributes.accent_color || defaultColors.accent,
  };
  const templateColorStyles = colorStyles || getColorStyles(brandColors);

  return (
    <>
      <Head>
        <title>{attributes.meta_title || `${practice.name} - Your Neighborhood Rheumatologist`}</title>
        <meta name="description" content={attributes.meta_description || `Local, accessible rheumatology care in your community at ${practice.name}`} />
      </Head>

      <div className="min-h-screen" style={templateColorStyles.secondary}>
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <span className="text-3xl mr-3">🏘️</span>
                <h1 className="text-2xl font-bold" style={templateColorStyles.primaryText}>{practice.name}</h1>
              </div>
              <nav className="space-x-6">
                <a href="#about" className="text-green-700 hover:text-green-900">About</a>
                <a href="#services" className="text-green-700 hover:text-green-900">Services</a>
                <a href="#team" className="text-green-700 hover:text-green-900">Our Team</a>
                <a href="#contact" className="text-green-700 hover:text-green-900">Contact</a>
              </nav>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="py-20 text-white" style={{ background: `linear-gradient(to right, ${templateColorStyles.primary.backgroundColor}, ${templateColorStyles.accent.backgroundColor})` }}>
          <div className="max-w-6xl mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold mb-6">Your Local Rheumatology Partner</h1>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              {attributes.welcome_message || "Right here in your neighborhood, providing personalized rheumatology care for our community"}
            </p>
            <div className="space-x-4">
              <a href="#appointment" className="bg-white px-8 py-3 rounded-full font-semibold hover:bg-gray-100" style={templateColorStyles.primaryText}>
                Book Your Visit
              </a>
              <a href="#about" className="border-2 border-white text-white px-8 py-3 rounded-full hover:bg-white transition-colors">
                Learn More
              </a>
            </div>
          </div>
        </section>

        {/* Community Focus */}
        <section id="about" className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-green-800 mb-6">Part of Your Community</h2>
                <p className="text-lg text-gray-700 mb-6">
                  {attributes.about_text || "We've been serving our local community for years, building relationships with patients and families. Our practice is rooted in the belief that quality healthcare should be accessible and personal."}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-100 rounded-lg">
                    <div className="text-2xl font-bold text-green-800">15+</div>
                    <div className="text-green-700">Years Local</div>
                  </div>
                  <div className="text-center p-4 bg-green-100 rounded-lg">
                    <div className="text-2xl font-bold text-green-800">2000+</div>
                    <div className="text-green-700">Neighbors Served</div>
                  </div>
                  <div className="text-center p-4 bg-green-100 rounded-lg">
                    <div className="text-2xl font-bold text-green-800">🏠</div>
                    <div className="text-green-700">Local Focus</div>
                  </div>
                  <div className="text-center p-4 bg-green-100 rounded-lg">
                    <div className="text-2xl font-bold text-green-800">❤️</div>
                    <div className="text-green-700">Community Care</div>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <div className="text-8xl mb-4">🏘️</div>
                <p className="text-green-700 font-semibold">Proud Community Member</p>
              </div>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="py-16 bg-green-50">
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center text-green-800 mb-12">How We Help Our Neighbors</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {(attributes.services || []).map((service: string, index: number) => (
                <div key={index} className="bg-white p-6 rounded-lg shadow-md">
                  <div className="text-3xl mb-4">🌟</div>
                  <h3 className="text-xl font-semibold text-green-800 mb-3">{service}</h3>
                  <p className="text-gray-600">Accessible, affordable care designed for our community's needs.</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Team */}
        <section id="team" className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center text-green-800 mb-12">Meet Your Local Team</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {staff.map((member) => (
                <div key={member.staff_id} className="text-center bg-green-50 p-6 rounded-lg">
                  <div className="w-24 h-24 bg-green-200 rounded-full mx-auto mb-4 flex items-center justify-center">
                    {member.photo_url ? (
                      <img src={member.photo_url} alt={member.name} className="w-24 h-24 rounded-full object-cover" />
                    ) : (
                      <span className="text-3xl">👨‍⚕️</span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-green-800">{member.name}</h3>
                  <p className="text-green-700">{member.title}</p>
                  <p className="text-sm text-green-600">{member.credentials}</p>
                  {member.bio && (
                    <p className="text-gray-600 text-sm mt-2">{member.bio}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Appointment */}
        <section id="appointment" className="py-16 bg-green-100">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold text-green-800 mb-8">Ready to Visit?</h2>
            <p className="text-lg text-green-700 mb-8">
              We're right here in your neighborhood, ready to help. Easy scheduling, convenient location.
            </p>
            <div className="bg-white p-8 rounded-lg shadow-md max-w-2xl mx-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-4">
                  <span className="text-2xl">📞</span>
                  <a href={`tel:${attributes.phone}`} className="text-xl text-green-700 hover:text-green-900">
                    {attributes.phone}
                  </a>
                </div>
                <div className="flex items-center justify-center space-x-4">
                  <span className="text-2xl">📧</span>
                  <a href={`mailto:${attributes.email}`} className="text-xl text-green-700 hover:text-green-900">
                    {attributes.email}
                  </a>
                </div>
                <p className="text-gray-600">Same-day appointments often available!</p>
              </div>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <h2 className="text-2xl font-bold text-green-800 mb-6">Visit Us</h2>
                <div className="space-y-4 text-gray-700">
                  {attributes.address_line1 && (
                    <div>
                      <p className="font-semibold">📍 Address:</p>
                      <p>{attributes.address_line1}</p>
                      {attributes.address_line2 && <p>{attributes.address_line2}</p>}
                      <p>{attributes.city}, {attributes.state} {attributes.zip_code}</p>
                    </div>
                  )}
                  <p>🚗 Plenty of parking available</p>
                  <p>♿ Wheelchair accessible</p>
                  <p>🚌 On bus route</p>
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-800 mb-6">Office Hours</h2>
                <div className="space-y-2 text-gray-700">
                  <div className="flex justify-between">
                    <span>Monday - Friday:</span>
                    <span>8:00 AM - 5:00 PM</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Saturday:</span>
                    <span>9:00 AM - 1:00 PM</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sunday:</span>
                    <span>Closed</span>
                  </div>
                  <p className="text-green-700 font-semibold mt-4">📞 24/7 answering service for urgent needs</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-green-800 text-white py-8">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <p className="mb-2">© {new Date().getFullYear()} {practice.name}</p>
            <p className="text-green-200">Proudly serving our community with quality rheumatology care</p>
          </div>
        </footer>
      </div>
    </>
  );
}
