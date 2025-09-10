import { db, practices, practice_attributes, staff_members, templates } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';
import { getTemplateComponent } from '@/lib/template-loader';
import { notFound } from 'next/navigation';

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
  const [template] = await db
    .select()
    .from(templates)
    .where(eq(templates.template_id, practice.template_id))
    .limit(1);

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
    practice,
    template: template || { slug: 'classic-professional' },
    attributes: attributes || {},
    staff: staff || [],
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

  // Parse JSON fields safely
  const parsedAttributes = {
    ...attributes,
    business_hours: attributes.business_hours,
    services: attributes.services,
    insurance_accepted: attributes.insurance_accepted,
    conditions_treated: attributes.conditions_treated,
    gallery_images: attributes.gallery_images,
  };

  const parsedStaff = staff.map(member => ({
    ...member,
    specialties: member.specialties,
    education: member.education,
  }));

  // Dynamically load the template component based on the slug
  const TemplateComponent = getTemplateComponent(template.slug);

  return (
    <TemplateComponent 
      practice={practice}
      attributes={parsedAttributes}
      staff={parsedStaff}
    />
  );
}
