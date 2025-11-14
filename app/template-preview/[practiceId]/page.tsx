import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import TemplatePreviewToolbar from '@/components/template-preview-toolbar';
import { db, practice_attributes, practices, staff_members, templates } from '@/lib/db';
import type { PracticeAttributes } from '@/lib/types/practice';
import {
  transformPractice,
  transformPracticeAttributes,
  transformStaffMember,
} from '@/lib/types/transformers';
import TemplateSwitcher from './template-switcher';
import { log } from '@/lib/logger';

async function getPracticeData(practiceId: string) {
  // Get practice
  const [practice] = await db
    .select()
    .from(practices)
    .where(eq(practices.practice_id, practiceId))
    .limit(1);

  if (!practice) {
    return null;
  }

  // Get template
  let template = null;
  if (practice.template_id) {
    [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.template_id, practice.template_id))
      .limit(1);
  }

  // Get practice attributes
  const [attributes] = await db
    .select()
    .from(practice_attributes)
    .where(eq(practice_attributes.practice_id, practiceId))
    .limit(1);

  // Get staff members
  const staff = await db
    .select()
    .from(staff_members)
    .where(eq(staff_members.practice_id, practiceId))
    .orderBy(staff_members.display_order);

  return {
    practice: transformPractice(practice),
    template: template || { slug: 'classic-professional' },
    attributes: attributes
      ? transformPracticeAttributes(attributes)
      : ({
          practice_attribute_id: '',
          practice_id: practiceId,
          updated_at: new Date().toISOString(),
        } as PracticeAttributes),
    staff: staff.map(transformStaffMember),
  };
}

export default async function TemplatePreview({
  params,
}: {
  params: Promise<{ practiceId: string }>;
}) {
  const { practiceId } = await params;
  const data = await getPracticeData(practiceId);

  if (!data) {
    notFound();
  }

  const { practice, template, attributes, staff } = data;

  // Fetch Clinect ratings data if enabled (same as practice website)
  let clinectRatings: import('@/lib/types/practice').ClinectRating | null = null;
  let clinectReviews: import('@/lib/types/practice').ClinectReview[] | null = null;

  if (attributes.ratings_feed_enabled && attributes.practice_slug) {
    try {
      const { createClinectService } = await import('@/lib/services/clinect-service');
      const clinectService = createClinectService();

      // Fetch ratings and reviews in parallel
      const [ratingsData, reviewsData] = await Promise.allSettled([
        Promise.race([
          clinectService.getRatings(attributes.practice_slug),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]),
        Promise.race([
          clinectService.getReviews(attributes.practice_slug, 5),
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
      log.error('Failed to fetch Clinect data for template preview', error, {
        operation: 'fetch_clinect_data_preview',
        practiceId: practice.practice_id,
        practiceSlug: attributes.practice_slug,
        component: 'server',
      });
    }
  }

  return (
    <div className="min-h-screen">
      {/* Server-rendered toolbar - client component will enhance it */}
      <TemplatePreviewToolbar currentTemplate={template.slug} isLoading={false} />

      {/* Template Content with client-side switching capability */}
      <TemplateSwitcher
        practice={practice}
        attributes={attributes}
        staff={staff}
        comments={[]} // Empty comments for preview mode
        clinectRatings={clinectRatings}
        clinectReviews={clinectReviews}
        initialTemplate={template.slug}
      />
    </div>
  );
}
