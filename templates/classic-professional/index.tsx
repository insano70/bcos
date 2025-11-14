import type { TemplateProps } from '@/lib/types/practice';
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

export default function ClassicProfessionalTemplate({
  practice,
  attributes,
  staff,
  comments = [],
  clinectRatings = null,
  clinectReviews = null,
  nonce
}: TemplateProps) {
  // Get colors for this practice or use template defaults
  const defaultColors = getTemplateDefaultColors('classic-professional');
  const brandColors = {
    primary: attributes.primary_color || defaultColors.primary,
    secondary: attributes.secondary_color || defaultColors.secondary,
    accent: attributes.accent_color || defaultColors.accent,
  };

  return (
    <>
      {/* Inject practice-specific CSS custom properties */}
      <ServerPracticeCSSInjector colors={brandColors} practiceId={practice.practice_id} nonce={nonce || ''} />

      <div className="min-h-screen bg-white bg-practice-secondary">
        {/* Header with navigation */}
        <Header practice={practice} attributes={attributes} />

        {/* Hero section */}
        <Hero practice={practice} attributes={attributes} />

        {/* Review Carousel section */}
        <ReviewCarousel
          comments={comments}
          ratingsEnabled={attributes.ratings_feed_enabled}
          practiceSlug={attributes.practice_slug}
          clinectRatings={clinectRatings}
          clinectReviews={clinectReviews}
          nonce={nonce}
        />

        {/* About section */}
        <About practice={practice} attributes={attributes} />

        {/* Gallery section */}
        <Gallery attributes={attributes} />

        {/* Services section */}
        <Services attributes={attributes} />

        {/* Providers section */}
        <Providers staff={staff} />

        {/* Appointment Form Section */}
        <section className="py-20 bg-practice-primary-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Schedule Your Appointment
              </h2>
              <p className="text-lg text-gray-600">
                Ready to take the first step toward better health? Request an appointment today.
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
