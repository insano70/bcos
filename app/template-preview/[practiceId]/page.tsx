import { db, practices, practice_attributes, staff_members, templates } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getTemplateComponent } from '@/lib/template-loader';
import { getColorStyles, getTemplateDefaultColors } from '@/lib/utils/color-utils';
import { notFound } from 'next/navigation';
import { transformPractice, transformPracticeAttributes, transformStaffMember } from '@/lib/types/transformers';
import type { PracticeAttributes } from '@/lib/types/practice';
import TemplatePreviewToolbar from '@/components/template-preview-toolbar';
import TemplateSwitcher from './template-switcher';

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
    attributes: attributes ? transformPracticeAttributes(attributes) : {
      practice_attribute_id: '',
      practice_id: practiceId,
      updated_at: new Date().toISOString()
    } as PracticeAttributes,
    staff: staff.map(transformStaffMember),
  };
}

export default async function TemplatePreview({
  params
}: {
  params: Promise<{ practiceId: string }>
}) {
  const { practiceId } = await params;
  const data = await getPracticeData(practiceId);

  if (!data) {
    notFound();
  }

  const { practice, template, attributes, staff } = data;

  // Generate color styles for the template
  const defaultColors = getTemplateDefaultColors(template.slug);
  const brandColors = {
    primary: attributes?.primary_color || defaultColors.primary,
    secondary: attributes?.secondary_color || defaultColors.secondary,
    accent: attributes?.accent_color || defaultColors.accent,
  };
  const colorStyles = getColorStyles(brandColors);

  // Dynamically load the template component based on the slug
  const TemplateComponent = getTemplateComponent(template.slug);

  return (
    <div className="min-h-screen">
      {/* Server-rendered toolbar - client component will enhance it */}
      <TemplatePreviewToolbar
        currentTemplate={template.slug}
        onTemplateChange={() => {}} // Will be enhanced by client
        isLoading={false}
      />

      {/* Template Content with client-side switching capability */}
      <TemplateSwitcher
        practice={practice}
        attributes={attributes}
        staff={staff}
        initialTemplate={template.slug}
        initialColorStyles={colorStyles}
      />
    </div>
  );
}
