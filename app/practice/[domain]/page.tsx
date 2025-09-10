import { db, practices, practice_attributes, staff_members, templates } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';
import ClassicProfessionalTemplate from '@/templates/classic-professional';
import { notFound } from 'next/navigation';

async function getPracticeByDomain(domain: string) {
  // Get practice by domain
  const [practice] = await db
    .select()
    .from(practices)
    .leftJoin(templates, eq(practices.template_id, templates.template_id))
    .where(eq(practices.domain, domain))
    .where(eq(practices.status, 'active'))
    .where(isNull(practices.deleted_at))
    .limit(1);

  if (!practice) {
    return null;
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
    .where(eq(staff_members.practice_id, practice.practices.practice_id))
    .where(eq(staff_members.is_active, true))
    .where(isNull(staff_members.deleted_at))
    .orderBy(staff_members.display_order);

  return {
    practice: practice.practices,
    template: practice.templates,
    attributes: attributes || {},
    staff: staff || [],
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
    title: data.attributes.meta_title || `${data.practice.name} - Rheumatology Care`,
    description: data.attributes.meta_description || `Expert rheumatology care at ${data.practice.name}`,
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

  const { practice, template, attributes, staff } = data;

  // Parse JSON fields
  const parsedAttributes = {
    ...attributes,
    business_hours: attributes.business_hours ? JSON.parse(attributes.business_hours) : null,
    services: attributes.services ? JSON.parse(attributes.services) : [],
    insurance_accepted: attributes.insurance_accepted ? JSON.parse(attributes.insurance_accepted) : [],
    conditions_treated: attributes.conditions_treated ? JSON.parse(attributes.conditions_treated) : [],
    gallery_images: attributes.gallery_images ? JSON.parse(attributes.gallery_images) : [],
  };

  const parsedStaff = staff.map(member => ({
    ...member,
    specialties: member.specialties ? JSON.parse(member.specialties) : [],
    education: member.education ? JSON.parse(member.education) : [],
  }));

  // For now, render Classic Professional template
  // Later we can check template.slug to render different templates
  return (
    <ClassicProfessionalTemplate 
      practice={practice}
      attributes={parsedAttributes}
      staff={parsedStaff}
    />
  );
}
