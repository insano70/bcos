import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { db, practice_attributes, practices, staff_members, templates } from '@/lib/db';
import { log } from '@/lib/logger';
import { getFeaturedComments } from '@/lib/services/practice-comments';
import { getTemplateComponent } from '@/lib/template-loader';
import type { PracticeAttributes, PracticeComment } from '@/lib/types/practice';
import {
  transformPractice,
  transformPracticeAttributes,
  transformStaffMember,
} from '@/lib/types/transformers';

async function getPracticeByDomain(domain: string) {
  log.info('practice lookup initiated', {
    domain,
    component: 'server',
    operation: 'get_practice_by_domain',
  });

  try {
    // Get practice by domain
    const [practice] = await db
      .select()
      .from(practices)
      .leftJoin(templates, eq(practices.template_id, templates.template_id))
      .where(
        and(
          eq(practices.domain, domain),
          eq(practices.status, 'active'),
          isNull(practices.deleted_at)
        )
      )
      .limit(1);

    if (!practice) {
      log.info('practice not found for domain', {
        domain,
        component: 'server',
        operation: 'get_practice_by_domain',
      });
      return null;
    }

    log.info('practice found', {
      practiceId: practice.practices.practice_id,
      practiceName: practice.practices.name,
      domain: practice.practices.domain,
      status: practice.practices.status,
      component: 'server',
      operation: 'get_practice_by_domain',
    });

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
      .where(
        and(
          eq(staff_members.practice_id, practice.practices.practice_id),
          eq(staff_members.is_active, true),
          isNull(staff_members.deleted_at)
        )
      )
      .orderBy(staff_members.display_order);

    return {
      practice: transformPractice(practice.practices),
      template: practice.templates,
      attributes: attributes ? transformPracticeAttributes(attributes) : ({} as PracticeAttributes),
      staff: staff.map(transformStaffMember),
    };
  } catch (error) {
    log.error('practice lookup failed', error, {
      domain,
      component: 'server',
      operation: 'get_practice_by_domain',
    });
    throw error;
  }
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
    description:
      data.attributes.meta_description || `Expert rheumatology care at ${data.practice.name}`,
    keywords: 'rheumatology, arthritis, lupus, rheumatologist, autoimmune, joint pain',
    openGraph: {
      title: data.attributes.meta_title || `${data.practice.name} - Expert Rheumatology Care`,
      description:
        data.attributes.meta_description || `Expert rheumatology care at ${data.practice.name}`,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: data.attributes.meta_title || `${data.practice.name} - Expert Rheumatology Care`,
      description:
        data.attributes.meta_description || `Expert rheumatology care at ${data.practice.name}`,
    },
    other: {
      'application/ld+json': JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'MedicalBusiness',
        name: data.practice.name,
        description: data.attributes.about_text || 'Expert rheumatology care',
        url: `https://${data.practice.domain}`,
        telephone: data.attributes.phone,
        email: data.attributes.email,
        address: {
          '@type': 'PostalAddress',
          streetAddress:
            `${data.attributes.address_line1} ${data.attributes.address_line2 || ''}`.trim(),
          addressLocality: data.attributes.city,
          addressRegion: data.attributes.state,
          postalCode: data.attributes.zip_code,
        },
        medicalSpecialty: 'Rheumatology',
        priceRange: '$$',
      }),
    },
  };
}

export default async function PracticeWebsite({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const data = await getPracticeByDomain(domain);

  if (!data) {
    notFound();
  }

  // Get CSP nonce from middleware headers
  const headersList = await headers();
  const nonce = headersList.get('x-style-nonce') || '';

  const { practice, template, attributes, staff } = data;

  // Fetch comments for this practice (handle missing table gracefully)
  let comments: PracticeComment[] = [];
  try {
    comments = await getFeaturedComments(practice.practice_id);
  } catch (_error) {
    log.debug('comments table not available, using empty array', {
      practiceId: practice.practice_id,
      component: 'server',
      operation: 'get_featured_comments',
    });
    comments = [];
  }

  // Fetch Clinect ratings data if enabled (server-side for SEO)
  let clinectRatings: import('@/lib/types/practice').ClinectRating | null = null;
  let clinectReviews: import('@/lib/types/practice').ClinectReview[] | null = null;

  if (attributes.ratings_feed_enabled && attributes.practice_slug) {
    try {
      const { createClinectService } = await import('@/lib/services/clinect-service');
      const clinectService = createClinectService();

      // Fetch ratings and reviews in parallel for better performance
      const [ratingsData, reviewsData] = await Promise.allSettled([
        Promise.race([
          clinectService.getRatings(attributes.practice_slug),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]),
        Promise.race([
          clinectService.getReviews(attributes.practice_slug, 20),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]),
      ]);

      // Handle ratings result
      if (ratingsData.status === 'fulfilled' && ratingsData.value) {
        clinectRatings = ratingsData.value;
      }

      // Handle reviews result
      if (reviewsData.status === 'fulfilled' && reviewsData.value) {
        clinectReviews = reviewsData.value.data;
      }
    } catch (error) {
      log.error('Failed to fetch Clinect data for practice website', error, {
        operation: 'fetch_clinect_data_ssr',
        practiceId: practice.practice_id,
        practiceSlug: attributes.practice_slug,
        component: 'server',
      });
    }
  }

  // Attributes and staff are already transformed/parsed by the transformers
  const parsedAttributes = attributes;
  const parsedStaff = staff;

  // Dynamically load the correct template component
  const TemplateComponent = getTemplateComponent(template?.slug || 'classic-professional');

  return (
    <TemplateComponent
      practice={practice}
      attributes={parsedAttributes}
      staff={parsedStaff}
      comments={comments}
      clinectRatings={clinectRatings}
      clinectReviews={clinectReviews}
      nonce={nonce}
    />
  );
}
