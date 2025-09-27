import { db, practices, practice_attributes, staff_members, templates } from '@/lib/db';
import { eq, isNull, and } from 'drizzle-orm';
import { getTemplateComponent } from '@/lib/template-loader';
import { getColorStyles, getTemplateDefaultColors } from '@/lib/utils/color-utils';
import { getFeaturedComments } from '@/lib/services/practice-comments';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { transformPractice, transformPracticeAttributes, transformStaffMember } from '@/lib/types/transformers'
import type { PracticeAttributes } from '@/lib/types/practice';

async function getPracticeByDomain(domain: string) {
  console.log('🔍 getPracticeByDomain called with domain:', domain);
  
  try {
    // Get practice by domain
    const [practice] = await db
      .select()
      .from(practices)
      .leftJoin(templates, eq(practices.template_id, templates.template_id))
      .where(and(
        eq(practices.domain, domain),
        eq(practices.status, 'active'),
        isNull(practices.deleted_at)
      ))
      .limit(1);

    console.log('🔍 Database query result:', practice ? 'Found practice' : 'No practice found');

    if (!practice) {
      console.log('❌ No practice found for domain:', domain);
      return null;
    }

    console.log('✅ Practice found:', {
      id: practice.practices.practice_id,
      name: practice.practices.name,
      domain: practice.practices.domain,
      status: practice.practices.status
    });
  } catch (error) {
    console.error('❌ Error in getPracticeByDomain:', error);
    throw error;
  }

  // Get practice attributes
  const [attributes] = await db
    .select()
    .from(practice_attributes)
    .where(eq(practice_attributes.practice_id, practice.practices.practice_id))
    .limit(1);

  // Get staff members
  const staff = await db
    .select()
    .from(staff_members)
    .where(and(
      eq(staff_members.practice_id, practice.practices.practice_id),
      eq(staff_members.is_active, true),
      isNull(staff_members.deleted_at)
    ))
    .orderBy(staff_members.display_order);

  return {
    practice: transformPractice(practice.practices),
    template: practice.templates,
    attributes: attributes ? transformPracticeAttributes(attributes) : {} as PracticeAttributes,
    staff: staff.map(transformStaffMember),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const data = await getPracticeByDomain(domain);
  
  if (!data) {
    return {
      title: 'Practice Not Found',
    };
  }

  return {
    title: data.attributes.meta_title || `${data.practice.name} - Expert Rheumatology Care`,
    description: data.attributes.meta_description || `Expert rheumatology care at ${data.practice.name}`,
    keywords: 'rheumatology, arthritis, lupus, rheumatologist, autoimmune, joint pain',
    openGraph: {
      title: data.attributes.meta_title || `${data.practice.name} - Expert Rheumatology Care`,
      description: data.attributes.meta_description || `Expert rheumatology care at ${data.practice.name}`,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: data.attributes.meta_title || `${data.practice.name} - Expert Rheumatology Care`,
      description: data.attributes.meta_description || `Expert rheumatology care at ${data.practice.name}`,
    },
    other: {
      'application/ld+json': JSON.stringify({
        "@context": "https://schema.org",
        "@type": "MedicalBusiness",
        "name": data.practice.name,
        "description": data.attributes.about_text || "Expert rheumatology care",
        "url": `https://${data.practice.domain}`,
        "telephone": data.attributes.phone,
        "email": data.attributes.email,
        "address": {
          "@type": "PostalAddress",
          "streetAddress": `${data.attributes.address_line1} ${data.attributes.address_line2 || ''}`.trim(),
          "addressLocality": data.attributes.city,
          "addressRegion": data.attributes.state,
          "postalCode": data.attributes.zip_code
        },
        "medicalSpecialty": "Rheumatology",
        "priceRange": "$$"
      })
    }
  };
}

export default async function PracticeWebsite({ 
  params 
}: { 
  params: Promise<{ domain: string }> 
}) {
  const { domain } = await params;
  const data = await getPracticeByDomain(domain);
  
  if (!data) {
    notFound();
  }

  // Get CSP nonce from middleware headers
  const headersList = await headers();
  const nonce = headersList.get('x-csp-nonce') || '';

  const { practice, template, attributes, staff } = data;

  // Fetch comments for this practice
  const comments = await getFeaturedComments(practice.practice_id);

  // Attributes and staff are already transformed/parsed by the transformers
  const parsedAttributes = attributes;
  const parsedStaff = staff;

  // Generate color styles for the template
  const defaultColors = getTemplateDefaultColors(template?.slug || 'classic-professional');
  const brandColors = {
    primary: parsedAttributes.primary_color || defaultColors.primary,
    secondary: parsedAttributes.secondary_color || defaultColors.secondary,
    accent: parsedAttributes.accent_color || defaultColors.accent,
  };
  // Legacy colorStyles for backward compatibility during migration
  const colorStyles = getColorStyles(brandColors);

  // Dynamically load the correct template component
  const TemplateComponent = getTemplateComponent(template?.slug || 'classic-professional');
  
  return (
    <TemplateComponent 
      practice={practice}
      attributes={parsedAttributes}
      staff={parsedStaff}
      comments={comments}
      colorStyles={colorStyles}
      nonce={nonce}
    />
  );
}
