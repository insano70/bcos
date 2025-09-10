import type { TemplateProps } from '@/lib/types/practice';
import Head from 'next/head';
import { getColorStyles, getTemplateDefaultColors } from '@/lib/utils/color-utils';
import Header from './components/header';
import Hero from './components/hero';
import About from './components/about';
import Services from './components/services';
import Providers from './components/providers';
import Contact from './components/contact';
import AppointmentForm from './components/appointment-form';
import Footer from './components/footer';

export default function ClassicProfessionalTemplate({ 
  practice, 
  attributes, 
  staff 
}: TemplateProps) {
  // Get colors for this practice or use template defaults
  const defaultColors = getTemplateDefaultColors('classic-professional');
  const brandColors = {
    primary: attributes.primary_color || defaultColors.primary,
    secondary: attributes.secondary_color || defaultColors.secondary,
    accent: attributes.accent_color || defaultColors.accent,
  };
  
  // Generate color styles for SSR-compatible rendering
  const colorStyles = getColorStyles(brandColors);

  return (
    <>
      {/* SEO and Meta Tags */}
      <Head>
        <title>{attributes.meta_title || `${practice.name} - Expert Rheumatology Care`}</title>
        <meta name="description" content={attributes.meta_description || `Expert rheumatology care at ${practice.name}`} />
        <meta name="keywords" content="rheumatology, arthritis, lupus, rheumatologist, autoimmune, joint pain" />
        <meta property="og:title" content={attributes.meta_title || `${practice.name} - Expert Rheumatology Care`} />
        <meta property="og:description" content={attributes.meta_description || `Expert rheumatology care at ${practice.name}`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={attributes.meta_title || `${practice.name} - Expert Rheumatology Care`} />
        <meta name="twitter:description" content={attributes.meta_description || `Expert rheumatology care at ${practice.name}`} />
        
        {/* Medical Practice Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "MedicalBusiness",
              "name": practice.name,
              "description": attributes.about_text || "Expert rheumatology care",
              "url": `https://${practice.domain}`,
              "telephone": attributes.phone,
              "email": attributes.email,
              "address": {
                "@type": "PostalAddress",
                "streetAddress": `${attributes.address_line1} ${attributes.address_line2 || ''}`.trim(),
                "addressLocality": attributes.city,
                "addressRegion": attributes.state,
                "postalCode": attributes.zip_code
              },
              "medicalSpecialty": "Rheumatology",
              "priceRange": "$$"
            })
          }}
        />
      </Head>

      <div className="min-h-screen bg-white">
        {/* Header with navigation */}
        <Header practice={practice} attributes={attributes} colorStyles={colorStyles} />
        
        {/* Hero section */}
        <Hero practice={practice} attributes={attributes} colorStyles={colorStyles} />
        
        {/* About section */}
        <About practice={practice} attributes={attributes} colorStyles={colorStyles} />
        
        {/* Services section */}
        <Services attributes={attributes} colorStyles={colorStyles} />
        
        {/* Providers section */}
        <Providers staff={staff} colorStyles={colorStyles} />
        
        {/* Appointment Form Section */}
        <section className="py-20" style={colorStyles.primaryBg50}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Schedule Your Appointment
              </h2>
              <p className="text-lg text-gray-600">
                Ready to take the first step toward better health? Request an appointment today.
              </p>
            </div>
            <AppointmentForm colorStyles={colorStyles} />
          </div>
        </section>
        
        {/* Contact section */}
        <Contact practice={practice} attributes={attributes} colorStyles={colorStyles} />
        
        {/* Footer */}
        <Footer practice={practice} attributes={attributes} colorStyles={colorStyles} />
      </div>
    </>
  );
}
