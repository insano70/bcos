import type { TemplateProps } from '@/lib/types/practice';
import Head from 'next/head';
import { getColorStyles, getTemplateDefaultColors } from '@/lib/utils/color-utils';
import { PracticeCSSInjector } from '@/components/practice-css-injector';
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

      {/* Inject practice-specific CSS custom properties */}
      <PracticeCSSInjector colors={brandColors} practiceId={practice.practice_id} />

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

    </>
  );
}
