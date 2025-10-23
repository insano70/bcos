/**
 * Database to Interface Transformers
 * Properly converts database schema types to TypeScript interfaces
 */

import { log } from '@/lib/logger';
import type { Template } from '@/lib/hooks/use-templates';
import type { practice_attributes, practices, staff_members, templates } from '../db/schema';
import type { Practice, PracticeAttributes, StaffMember } from './practice';

/**
 * Transform database practice record to Practice interface
 */
export function transformPractice(dbPractice: typeof practices.$inferSelect): Practice {
  return {
    practice_id: dbPractice.practice_id,
    id: dbPractice.practice_id, // Alias for selection hook compatibility
    name: dbPractice.name,
    domain: dbPractice.domain || '',
    status: (dbPractice.status as 'active' | 'inactive' | 'pending') || 'active',
    template_id: dbPractice.template_id || '',
    created_at: dbPractice.created_at?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Transform database staff member record to StaffMember interface
 */
export function transformStaffMember(dbStaff: typeof staff_members.$inferSelect): StaffMember {
  const result: StaffMember = {
    staff_id: dbStaff.staff_id,
    practice_id: dbStaff.practice_id || '',
    name: dbStaff.name || '',
    specialties: dbStaff.specialties ? safeJsonParse(dbStaff.specialties, []) : [],
    education: dbStaff.education ? safeJsonParse(dbStaff.education, []) : [],
    display_order: dbStaff.display_order || 0,
    is_active: dbStaff.is_active ?? true,
  };

  // Only add optional properties if they have values
  if (dbStaff.title) result.title = dbStaff.title;
  if (dbStaff.credentials) result.credentials = dbStaff.credentials;
  if (dbStaff.bio) result.bio = dbStaff.bio;
  if (dbStaff.photo_url) result.photo_url = dbStaff.photo_url;

  return result;
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
  };
}

/**
 * Transform database practice attributes record to PracticeAttributes interface
 */
export function transformPracticeAttributes(
  dbAttributes: typeof practice_attributes.$inferSelect
): PracticeAttributes {
  const result: PracticeAttributes = {
    practice_attribute_id: dbAttributes.practice_attribute_id,
    practice_id: dbAttributes.practice_id || '',
    updated_at: dbAttributes.updated_at?.toISOString() || new Date().toISOString(),
  };

  // Only add optional properties if they have values
  if (dbAttributes.phone) result.phone = dbAttributes.phone;
  if (dbAttributes.email) result.email = dbAttributes.email;
  if (dbAttributes.address_line1) result.address_line1 = dbAttributes.address_line1;
  if (dbAttributes.address_line2) result.address_line2 = dbAttributes.address_line2;
  if (dbAttributes.city) result.city = dbAttributes.city;
  if (dbAttributes.state) result.state = dbAttributes.state;
  if (dbAttributes.zip_code) result.zip_code = dbAttributes.zip_code;

  // Business Details - parse JSON fields safely
  if (dbAttributes.business_hours) {
    const parsedBusinessHours = safeJsonParse(dbAttributes.business_hours, null);
    if (parsedBusinessHours) result.business_hours = parsedBusinessHours;
  }
  if (dbAttributes.services) result.services = safeJsonParse(dbAttributes.services, []);
  if (dbAttributes.insurance_accepted)
    result.insurance_accepted = safeJsonParse(dbAttributes.insurance_accepted, []);
  if (dbAttributes.conditions_treated)
    result.conditions_treated = safeJsonParse(dbAttributes.conditions_treated, []);

  // Content
  if (dbAttributes.about_text) result.about_text = dbAttributes.about_text;
  if (dbAttributes.mission_statement) result.mission_statement = dbAttributes.mission_statement;
  if (dbAttributes.welcome_message) result.welcome_message = dbAttributes.welcome_message;

  // Media
  if (dbAttributes.logo_url) result.logo_url = dbAttributes.logo_url;
  if (dbAttributes.hero_image_url) result.hero_image_url = dbAttributes.hero_image_url;
  if (dbAttributes.hero_overlay_opacity !== null && dbAttributes.hero_overlay_opacity !== undefined) {
    result.hero_overlay_opacity = Number(dbAttributes.hero_overlay_opacity);
  }
  if (dbAttributes.gallery_images)
    result.gallery_images = safeJsonParse(dbAttributes.gallery_images, []);

  // SEO
  if (dbAttributes.meta_title) result.meta_title = dbAttributes.meta_title;
  if (dbAttributes.meta_description) result.meta_description = dbAttributes.meta_description;

  // Brand Colors
  if (dbAttributes.primary_color) result.primary_color = dbAttributes.primary_color;
  if (dbAttributes.secondary_color) result.secondary_color = dbAttributes.secondary_color;
  if (dbAttributes.accent_color) result.accent_color = dbAttributes.accent_color;

  return result;
}

/**
 * Safe JSON parsing with fallback
 */
function safeJsonParse<T>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString || typeof jsonString !== 'string') {
    return fallback;
  }

  try {
    const parsed = JSON.parse(jsonString);
    return parsed !== null ? parsed : fallback;
  } catch (error) {
    log.warn('failed to parse json in transformer', {
      jsonPreview: jsonString?.substring(0, 100),
      error: error instanceof Error ? error.message : String(error),
      component: 'transformers',
      operation: 'safe_json_parse',
    });
    return fallback;
  }
}
