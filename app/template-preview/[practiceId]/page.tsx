import { db, practices, practice_attributes, staff_members, templates } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';
import { getTemplateComponent } from '@/lib/template-loader';
import { getColorStyles, getTemplateDefaultColors } from '@/lib/utils/color-utils';
import { notFound } from 'next/navigation';
import { transformPractice, transformPracticeAttributes, transformStaffMember } from '@/lib/types/transformers';

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
    attributes: attributes ? transformPracticeAttributes(attributes) : {} as any,
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

  // Attributes and staff are already transformed/parsed by the transformers
  const parsedAttributes = attributes;
  const parsedStaff = staff;

  // Generate color styles for the template
  const defaultColors = getTemplateDefaultColors(template.slug);
  const brandColors = {
    primary: parsedAttributes.primary_color || defaultColors.primary,
    secondary: parsedAttributes.secondary_color || defaultColors.secondary,
    accent: parsedAttributes.accent_color || defaultColors.accent,
  };
  const colorStyles = getColorStyles(brandColors);

  // Dynamically load the template component based on the slug
  const TemplateComponent = getTemplateComponent(template.slug);

  return (
    <TemplateComponent 
      practice={practice}
      attributes={parsedAttributes}
      staff={parsedStaff}
      colorStyles={colorStyles}
    />
  );
}
