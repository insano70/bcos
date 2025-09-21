/**
 * Database to Interface Transformers
 * Properly converts database schema types to TypeScript interfaces
 */

import type { Practice, PracticeAttributes, StaffMember, } from './practice'
import type { Template } from '@/lib/hooks/use-templates'

/**
 * Transform database practice record to Practice interface
 */
export function transformPractice(dbPractice: unknown): Practice {
  const practice = dbPractice as Record<string, unknown>;
  return {
    practice_id: practice.practice_id as string,
    id: practice.practice_id as string, // Alias for selection hook compatibility
    name: practice.name as string,
    domain: practice.domain as string,
    status: (practice.status as string) || 'active',
    template_id: practice.template_id as string,
    created_at: practice.created_at ? new Date(practice.created_at as string | Date).toISOString() : new Date().toISOString(),
  }
}

/**
 * Transform database staff member record to StaffMember interface
 */
export function transformStaffMember(dbStaff: unknown): StaffMember {
  const staff = dbStaff as Record<string, unknown>;
  return {
    staff_id: staff.staff_id as string,
    practice_id: staff.practice_id as string,
    name: staff.name as string,
    title: (staff.title as string) || undefined,
    credentials: (staff.credentials as string) || undefined,
    bio: (staff.bio as string) || undefined,
    photo_url: (staff.photo_url as string) || undefined,
    specialties: staff.specialties ? safeJsonParse(staff.specialties as string, []) : [],
    education: staff.education ? safeJsonParse(staff.education as string, []) : [],
    display_order: (staff.display_order as number) || 0,
    is_active: (staff.is_active as boolean) ?? true,
  }
}

/**
 * Transform database template record to Template interface
 */
export function transformTemplate(dbTemplate: unknown): Template {
  const template = dbTemplate as Record<string, unknown>;
  return {
    id: template.template_id as string,
    name: template.name as string,
    slug: (template.slug as string) || (template.name as string).toLowerCase().replace(/\s+/g, '-'),
    description: (template.description as string) || '',
    preview_image_url: template.preview_image_url as string,
    is_active: (template.is_active as boolean) ?? true,
    created_at: template.created_at ? new Date(template.created_at as string | Date).toISOString() : new Date().toISOString(),
  }
}

/**
 * Transform database practice attributes record to PracticeAttributes interface
 */
export function transformPracticeAttributes(dbAttributes: unknown): PracticeAttributes {
  const attributes = dbAttributes as Record<string, unknown>;
  return {
    practice_attribute_id: attributes.practice_attribute_id as string,
    practice_id: attributes.practice_id as string,

    // Contact Information
    phone: (attributes.phone as string) || undefined,
    email: (attributes.email as string) || undefined,
    address_line1: (attributes.address_line1 as string) || undefined,
    address_line2: (attributes.address_line2 as string) || undefined,
    city: (attributes.city as string) || undefined,
    state: (attributes.state as string) || undefined,
    zip_code: (attributes.zip_code as string) || undefined,

    // Business Details - parse JSON fields safely
    ...(attributes.business_hours && { business_hours: safeJsonParse(attributes.business_hours as string, undefined) }),
    services: attributes.services ? safeJsonParse(attributes.services as string, []) : undefined,
    insurance_accepted: attributes.insurance_accepted ? safeJsonParse(attributes.insurance_accepted as string, []) : undefined,
    conditions_treated: attributes.conditions_treated ? safeJsonParse(attributes.conditions_treated as string, []) : undefined,

    // Content
    about_text: (attributes.about_text as string) || undefined,
    mission_statement: (attributes.mission_statement as string) || undefined,
    welcome_message: (attributes.welcome_message as string) || undefined,

    // Media
    logo_url: (attributes.logo_url as string) || undefined,
    hero_image_url: (attributes.hero_image_url as string) || undefined,
    gallery_images: attributes.gallery_images ? safeJsonParse(attributes.gallery_images as string, []) : undefined,

    // SEO
    meta_title: (attributes.meta_title as string) || undefined,
    meta_description: (attributes.meta_description as string) || undefined,

    // Brand Colors
    primary_color: (attributes.primary_color as string) || undefined,
    secondary_color: (attributes.secondary_color as string) || undefined,
    accent_color: (attributes.accent_color as string) || undefined,

    updated_at: attributes.updated_at ? new Date(attributes.updated_at as string | Date).toISOString() : new Date().toISOString(),
  }
}

/**
 * Safe JSON parsing with fallback
 */
function safeJsonParse<T>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString || typeof jsonString !== 'string') {
    return fallback
  }
  
  try {
    const parsed = JSON.parse(jsonString)
    return parsed !== null ? parsed : fallback
  } catch (error) {
    console.warn('Failed to parse JSON:', jsonString, error)
    return fallback
  }
}
