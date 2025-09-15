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

export default function TidyProfessionalTemplate({ 
  practice, 
  attributes, 
  staff,
  colorStyles 
}: TemplateProps) {
  // Generate color styles if not provided
  const defaultColors = getTemplateDefaultColors('tidy-professional');
  const brandColors = {
    primary: attributes.primary_color || defaultColors.primary,
    secondary: attributes.secondary_color || defaultColors.secondary,
    accent: attributes.accent_color || defaultColors.accent,
  };
  const templateColorStyles = colorStyles || getColorStyles(brandColors);

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

      <div className="flex flex-col min-h-screen overflow-hidden font-inter">
        <Header 
          practice={practice} 
          attributes={attributes} 
          colorStyles={templateColorStyles} 
        />
        
        <main className="grow">
          <Hero 
            practice={practice} 
            attributes={attributes} 
            colorStyles={templateColorStyles} 
          />
          
          <About 
            practice={practice} 
            attributes={attributes} 
            colorStyles={templateColorStyles} 
          />
          
          <Services 
            practice={practice} 
            attributes={attributes} 
            colorStyles={templateColorStyles} 
          />
          
          <Providers 
            practice={practice} 
            attributes={attributes} 
            staff={staff} 
            colorStyles={templateColorStyles} 
          />
          
          <Contact 
            practice={practice} 
            attributes={attributes} 
            colorStyles={templateColorStyles} 
          />
          
          <AppointmentForm 
            practice={practice} 
            attributes={attributes} 
            colorStyles={templateColorStyles} 
          />
        </main>

        <Footer 
          practice={practice} 
          attributes={attributes} 
          colorStyles={templateColorStyles} 
        />
      </div>

      {/* Custom Styles for Tidy Professional Template */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .font-playfair-display {
          font-family: 'Playfair Display', serif;
        }
        .font-inter {
          font-family: 'Inter', sans-serif;
        }
        .h1 {
          font-size: 4rem;
          line-height: 1.1562;
          letter-spacing: -0.01em;
          font-weight: 700;
        }
        .h2 {
          font-size: 3rem;
          line-height: 1.2;
          letter-spacing: -0.01em;
          font-weight: 600;
        }
        .h3 {
          font-size: 2rem;
          line-height: 1.3125;
          letter-spacing: -0.01em;
          font-weight: 600;
        }
        .h4 {
          font-size: 1.5rem;
          line-height: 1.415;
          letter-spacing: -0.01em;
          font-weight: 600;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.75rem 1.5rem;
          border-radius: 0.5rem;
          font-weight: 500;
          transition: all 150ms ease-in-out;
          text-decoration: none;
          cursor: pointer;
          border: none;
        }
        .btn:hover {
          transform: translateY(-1px);
        }
        @media (min-width: 768px) {
          .h1 {
            font-size: 4rem;
          }
          .h2 {
            font-size: 3rem;
          }
        }
        /* Tidy-specific animations */
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translate3d(0, 10px, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
        .animate-fade-up {
          animation: fadeUp 0.6s ease-out forwards;
        }
        .animate-delay-100 {
          animation-delay: 100ms;
        }
        .animate-delay-200 {
          animation-delay: 200ms;
        }
        .animate-delay-300 {
          animation-delay: 300ms;
        }
        `
      }} />
    </>
  );
}
