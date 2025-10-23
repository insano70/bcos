import type { TemplateProps } from '@/lib/types/practice';
import Head from 'next/head';
import { getTemplateDefaultColors } from '@/lib/utils/color-utils';
import { JSONLD } from '@/lib/security/nonce-components';
import { PracticeCSSInjector } from '@/components/practice-css-injector';
import Header from './components/header';
import Hero from './components/hero';
import About from './components/about';
import Services from './components/services';
import Providers from './components/providers';
import Contact from './components/contact';
import AppointmentForm from './components/appointment-form';
import Footer from './components/footer';

export default function WarmWelcomingTemplate({
  practice,
  attributes,
  staff
}: TemplateProps) {
  // Get colors for this practice or use template defaults
  const defaultColors = getTemplateDefaultColors('warm-welcoming');
  const brandColors = {
    primary: attributes.primary_color || defaultColors.primary,
    secondary: attributes.secondary_color || defaultColors.secondary,
    accent: attributes.accent_color || defaultColors.accent,
  };

  return (
    <>
      {/* SEO and Meta Tags */}
      <Head>
        <title>{attributes.meta_title || `${practice.name} - Compassionate Rheumatology Care`}</title>
        <meta name="description" content={attributes.meta_description || `Warm, compassionate rheumatology care at ${practice.name}. Treating patients like family.`} />
        <meta name="keywords" content="compassionate rheumatology, patient-centered care, arthritis treatment, lupus, rheumatologist" />
        <meta property="og:title" content={attributes.meta_title || `${practice.name} - Compassionate Rheumatology Care`} />
        <meta property="og:description" content={attributes.meta_description || `Warm, compassionate rheumatology care at ${practice.name}`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={attributes.meta_title || `${practice.name} - Compassionate Rheumatology Care`} />
        <meta name="twitter:description" content={attributes.meta_description || `Warm, compassionate rheumatology care at ${practice.name}`} />
        
        {/* Medical Practice Structured Data */}
        <JSONLD data={{
          "@context": "https://schema.org",
          "@type": "MedicalBusiness",
          "name": practice.name,
          "description": attributes.about_text || "Compassionate, patient-centered rheumatology care",
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
        }} />
      </Head>

      {/* Inject practice-specific CSS custom properties */}
      <PracticeCSSInjector colors={brandColors} practiceId={practice.practice_id} />

      <div className="min-h-screen bg-practice-secondary">
        {/* Header with navigation */}
        <Header practice={practice} attributes={attributes} />

        {/* Hero section */}
        <Hero practice={practice} attributes={attributes} />

        {/* About section */}
        <About practice={practice} attributes={attributes} />

        {/* Services section */}
        <Services attributes={attributes} />

        {/* Providers section */}
        <Providers staff={staff} />

        {/* Appointment Form Section */}
        <section className="py-20 bg-practice-primary-100">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-serif mb-4 text-practice-primary">
                Schedule Your Visit
              </h2>
              <p className="text-lg text-practice-primary">
                We're here to help you feel better. Let's start your journey to wellness together.
              </p>
            </div>
            <AppointmentForm />
          </div>
        </section>

        {/* Contact section */}
        <Contact practice={practice} attributes={attributes} />

        {/* Footer */}
        <Footer practice={practice} attributes={attributes} />
      </div>
    </>
  );
}
