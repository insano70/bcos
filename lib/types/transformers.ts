/**
 * Database to Interface Transformers
 * Properly converts database schema types to TypeScript interfaces
 */

import { Practice, StaffMember, PracticeAttributes } from './practice';
import { practices, staff_members, templates, practice_attributes } from '../db/schema';
import type { Template } from '@/lib/hooks/use-templates';

/**
 * Transform database practice record to Practice interface
 */
export function transformPractice(dbPractice: typeof practices.$inferSelect): Practice {
  return {
    practice_id: dbPractice.practice_id,
    id: dbPractice.practice_id, // Alias for selection hook compatibility
    name: dbPractice.name,
    domain: dbPractice.domain,
    status: dbPractice.status || 'active',
    template_id: dbPractice.template_id,
    created_at: dbPractice.created_at?.toISOString() || new Date().toISOString(),
  }
}

/**
 * Transform database staff member record to StaffMember interface
 */
export function transformStaffMember(dbStaff: typeof staff_members.$inferSelect): StaffMember {
  return {
    staff_id: dbStaff.staff_id,
    practice_id: dbStaff.practice_id,
    name: dbStaff.name,
    title: dbStaff.title || undefined,
    credentials: dbStaff.credentials || undefined,
    bio: dbStaff.bio || undefined,
    photo_url: dbStaff.photo_url || undefined,
    specialties: dbStaff.specialties ? safeJsonParse(dbStaff.specialties, []) : [],
    education: dbStaff.education ? safeJsonParse(dbStaff.education, []) : [],
    display_order: dbStaff.display_order || 0,
    is_active: dbStaff.is_active ?? true,
  }
}

/**
 * Transform database template record to Template interface
 */
export function transformTemplate(dbTemplate: typeof templates.$inferSelect): Template {
  return {
    id: dbTemplate.template_id,
    name: dbTemplate.name,
    slug: dbTemplate.slug || dbTemplate.name.toLowerCase().replace(/\s+/g, '-'),
    description: dbTemplate.description || '',
    preview_image_url: dbTemplate.preview_image_url,
    is_active: dbTemplate.is_active ?? true,
    created_at: dbTemplate.created_at?.toISOString() || new Date().toISOString(),
  }
}

/**
 * Transform database practice attributes record to PracticeAttributes interface
 */
export function transformPracticeAttributes(dbAttributes: typeof practice_attributes.$inferSelect): PracticeAttributes {
  return {
    practice_attribute_id: dbAttributes.practice_attribute_id,
    practice_id: dbAttributes.practice_id,
    
    // Contact Information
    phone: dbAttributes.phone || undefined,
    email: dbAttributes.email || undefined,
    address_line1: dbAttributes.address_line1 || undefined,
    address_line2: dbAttributes.address_line2 || undefined,
    city: dbAttributes.city || undefined,
    state: dbAttributes.state || undefined,
    zip_code: dbAttributes.zip_code || undefined,
    
    // Business Details - parse JSON fields safely
    ...(dbAttributes.business_hours && { business_hours: safeJsonParse(dbAttributes.business_hours, undefined) }),
    services: dbAttributes.services ? safeJsonParse(dbAttributes.services, []) : undefined,
    insurance_accepted: dbAttributes.insurance_accepted ? safeJsonParse(dbAttributes.insurance_accepted, []) : undefined,
    conditions_treated: dbAttributes.conditions_treated ? safeJsonParse(dbAttributes.conditions_treated, []) : undefined,
    
    // Content
    about_text: dbAttributes.about_text || undefined,
    mission_statement: dbAttributes.mission_statement || undefined,
    welcome_message: dbAttributes.welcome_message || undefined,
    
    // Media
    logo_url: dbAttributes.logo_url || undefined,
    hero_image_url: dbAttributes.hero_image_url || undefined,
    gallery_images: dbAttributes.gallery_images ? safeJsonParse(dbAttributes.gallery_images, []) : undefined,
    
    // SEO
    meta_title: dbAttributes.meta_title || undefined,
    meta_description: dbAttributes.meta_description || undefined,
    
    // Brand Colors
    primary_color: dbAttributes.primary_color || undefined,
    secondary_color: dbAttributes.secondary_color || undefined,
    accent_color: dbAttributes.accent_color || undefined,
    
    updated_at: dbAttributes.updated_at?.toISOString() || new Date().toISOString(),
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
