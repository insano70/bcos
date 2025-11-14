import type { TemplateProps } from '@/lib/types/practice';
import Head from 'next/head';
import { getTemplateDefaultColors } from '@/lib/utils/color-utils';
import { ServerPracticeCSSInjector } from '@/components/practice-css-injector';
import Header from './components/header';
import Hero from './components/hero';
import ReviewCarousel from './components/review-carousel';
import About from './components/about';
import Gallery from './components/gallery';
import Services from './components/services';
import Providers from './components/providers';
import Contact from './components/contact';
import AppointmentForm from './components/appointment-form';
import Footer from './components/footer';

export default function TidyProfessionalTemplate({
  practice,
  attributes,
  staff,
  comments = [],
  clinectRatings = null,
  clinectReviews = null,
  nonce
}: TemplateProps) {
  // Get colors for this practice or use template defaults
  const defaultColors = getTemplateDefaultColors('tidy-professional');
  const brandColors = {
    primary: attributes.primary_color || defaultColors.primary,
    secondary: attributes.secondary_color || defaultColors.secondary,
    accent: attributes.accent_color || defaultColors.accent,
  };

  return (
    <>
      {/* SEO and Meta Tags */}
      <Head>
        <title>{attributes.meta_title || `${practice.name} - Expert Rheumatology Care`}</title>
        <meta name="description" content={attributes.meta_description || `Professional rheumatology services at ${practice.name}. Expert care for arthritis, autoimmune conditions, and joint health.`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`https://${practice.domain}`} />
        
        {/* Open Graph */}
        <meta property="og:title" content={attributes.meta_title || `${practice.name} - Expert Rheumatology Care`} />
        <meta property="og:description" content={attributes.meta_description || `Professional rheumatology services at ${practice.name}`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://${practice.domain}`} />
        {attributes.hero_image_url && (
          <meta property="og:image" content={attributes.hero_image_url} />
        )}
        
        {/* Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" 
          rel="stylesheet" 
        />
      </Head>

      {/* Inject practice-specific CSS custom properties */}
      <ServerPracticeCSSInjector colors={brandColors} practiceId={practice.practice_id} nonce={nonce || ''} />

      <div className="flex flex-col min-h-screen overflow-hidden font-inter">
        <Header
          practice={practice}
          attributes={attributes}
        />

        <main className="grow">
          <Hero
            practice={practice}
            attributes={attributes}
          />

          <ReviewCarousel
            comments={comments}
            ratingsEnabled={attributes.ratings_feed_enabled}
            practiceSlug={attributes.practice_slug}
            clinectRatings={clinectRatings}
            clinectReviews={clinectReviews}
            nonce={nonce}
          />

          <About
            practice={practice}
            attributes={attributes}
          />

          <Gallery
            attributes={attributes}
          />

          <Services
            practice={practice}
            attributes={attributes}
          />

          <Providers
            practice={practice}
            attributes={attributes}
            staff={staff}
          />

          <section className="py-20 bg-practice-primary-50">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 className="font-playfair-display text-4xl md:text-5xl font-bold text-slate-900 mb-4">
                  Schedule Your Appointment
                </h2>
                <p className="text-lg text-slate-600 font-inter">
                  Ready to take the first step toward better health? Request an appointment today.
                </p>
              </div>
              <AppointmentForm
                practice={practice}
                attributes={attributes}
              />
            </div>
          </section>

          <Contact
            practice={practice}
            attributes={attributes}
          />
        </main>

        <Footer
          practice={practice}
          attributes={attributes}
        />
      </div>

    </>
  );
}
