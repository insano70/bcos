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
    status: (practice.status as 'active' | 'inactive' | 'pending') || 'active',
    template_id: practice.template_id as string,
    created_at: practice.created_at ? new Date(practice.created_at as string | Date).toISOString() : new Date().toISOString(),
  }
}

/**
 * Transform database staff member record to StaffMember interface
 */
export function transformStaffMember(dbStaff: unknown): StaffMember {
  const staff = dbStaff as Record<string, unknown>;
  const result: StaffMember = {
    staff_id: staff.staff_id as string,
    practice_id: staff.practice_id as string,
    name: staff.name as string,
    specialties: staff.specialties ? safeJsonParse(staff.specialties as string, []) : [],
    education: staff.education ? safeJsonParse(staff.education as string, []) : [],
    display_order: (staff.display_order as number) || 0,
    is_active: (staff.is_active as boolean) ?? true,
  };
  
  // Only add optional properties if they have truthy values
  if (staff.title && typeof staff.title === 'string') {
    result.title = staff.title;
  }
  if (staff.credentials && typeof staff.credentials === 'string') {
    result.credentials = staff.credentials;
  }
  if (staff.bio && typeof staff.bio === 'string') {
    result.bio = staff.bio;
  }
  if (staff.photo_url && typeof staff.photo_url === 'string') {
    result.photo_url = staff.photo_url;
  }
  
  return result;
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
    ...(attributes.phone && typeof attributes.phone === 'string' ? { phone: attributes.phone } : {}),
    ...(attributes.email && typeof attributes.email === 'string' ? { email: attributes.email } : {}),
    ...(attributes.address_line1 && typeof attributes.address_line1 === 'string' ? { address_line1: attributes.address_line1 } : {}),
    ...(attributes.address_line2 && typeof attributes.address_line2 === 'string' ? { address_line2: attributes.address_line2 } : {}),
    ...(attributes.city && typeof attributes.city === 'string' ? { city: attributes.city } : {}),
    ...(attributes.state && typeof attributes.state === 'string' ? { state: attributes.state } : {}),
    ...(attributes.zip_code && typeof attributes.zip_code === 'string' ? { zip_code: attributes.zip_code } : {}),

    // Business Details - parse JSON fields safely
    ...(attributes.business_hours ? { 
      business_hours: safeJsonParse(attributes.business_hours as string, {
        monday: { open: '09:00', close: '17:00', closed: false },
        tuesday: { open: '09:00', close: '17:00', closed: false },
        wednesday: { open: '09:00', close: '17:00', closed: false },
        thursday: { open: '09:00', close: '17:00', closed: false },
        friday: { open: '09:00', close: '17:00', closed: false },
        saturday: { closed: true },
        sunday: { closed: true }
      })
    } : {}),
    ...(attributes.services ? { services: safeJsonParse(attributes.services as string, []) } : {}),
    ...(attributes.insurance_accepted ? { insurance_accepted: safeJsonParse(attributes.insurance_accepted as string, []) } : {}),
    ...(attributes.conditions_treated ? { conditions_treated: safeJsonParse(attributes.conditions_treated as string, []) } : {}),

    // Content
    ...(attributes.about_text && typeof attributes.about_text === 'string' ? { about_text: attributes.about_text } : {}),
    ...(attributes.mission_statement && typeof attributes.mission_statement === 'string' ? { mission_statement: attributes.mission_statement } : {}),
    ...(attributes.welcome_message && typeof attributes.welcome_message === 'string' ? { welcome_message: attributes.welcome_message } : {}),

    // Media
    ...(attributes.logo_url && typeof attributes.logo_url === 'string' ? { logo_url: attributes.logo_url } : {}),
    ...(attributes.hero_image_url && typeof attributes.hero_image_url === 'string' ? { hero_image_url: attributes.hero_image_url } : {}),
    ...(attributes.gallery_images ? { gallery_images: safeJsonParse(attributes.gallery_images as string, []) } : {}),

    // SEO
    ...(attributes.meta_title && typeof attributes.meta_title === 'string' ? { meta_title: attributes.meta_title } : {}),
    ...(attributes.meta_description && typeof attributes.meta_description === 'string' ? { meta_description: attributes.meta_description } : {}),

    // Brand Colors
    ...(attributes.primary_color && typeof attributes.primary_color === 'string' ? { primary_color: attributes.primary_color } : {}),
    ...(attributes.secondary_color && typeof attributes.secondary_color === 'string' ? { secondary_color: attributes.secondary_color } : {}),
    ...(attributes.accent_color && typeof attributes.accent_color === 'string' ? { accent_color: attributes.accent_color } : {}),

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
