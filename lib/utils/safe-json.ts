/**
 * Safe JSON Parsing Utilities
 * Provides XSS-safe JSON parsing with validation
 */

import { z } from 'zod';

/**
 * Safely parse JSON with validation
 * Returns null if parsing fails or validation fails
 */
export function safeJsonParse<T>(
  jsonString: string | null | undefined,
  schema?: z.ZodSchema<T>
): T | null {
  if (!jsonString || typeof jsonString !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonString);

    if (schema) {
      const result = schema.safeParse(parsed);
      return result.success ? result.data : null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Safe JSON parsing for arrays with validation
 */
export function safeJsonParseArray<T>(
  jsonString: string | null | undefined,
  itemSchema?: z.ZodSchema<T>
): T[] {
  if (!itemSchema) {
    // If no schema provided, return unknown[] cast to T[]
    const parsed = safeJsonParse(jsonString, z.array(z.unknown()));
    return (Array.isArray(parsed) ? parsed : []) as T[];
  }
  const parsed = safeJsonParse(jsonString, z.array(itemSchema));
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Schemas for common JSON data structures
 */
export const businessHoursSchema = z.object({
  monday: z.string().optional(),
  tuesday: z.string().optional(),
  wednesday: z.string().optional(),
  thursday: z.string().optional(),
  friday: z.string().optional(),
  saturday: z.string().optional(),
  sunday: z.string().optional(),
});

export const serviceSchema = z.object({
  name: z.string().max(255),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
});

export const insuranceSchema = z.object({
  name: z.string().max(255),
  accepted: z.boolean().default(true),
});

export const conditionSchema = z.object({
  name: z.string().max(255),
  description: z.string().max(500).optional(),
});

export const galleryImageSchema = z.object({
  url: z.string().url().max(500),
  alt: z.string().max(255).optional(),
  caption: z.string().max(500).optional(),
});

export const specialtySchema = z.string().max(255);

export const educationSchema = z.object({
  degree: z.string().max(255),
  school: z.string().max(255),
  year: z
    .string()
    .max(4)
    .regex(/^\d{4}$/, 'Must be a valid year'),
});

/**
 * Safe parsing functions for practice attributes
 */
export function parseBusinessHours(jsonString: string | null): BusinessHours | null {
  return safeJsonParse(jsonString, businessHoursSchema);
}

// Define types for the parsed data
export type BusinessHours = z.infer<typeof businessHoursSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type Insurance = z.infer<typeof insuranceSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type GalleryImage = z.infer<typeof galleryImageSchema>;
export type Education = z.infer<typeof educationSchema>;

export function parseServices(jsonString: string | null): Service[] {
  return safeJsonParseArray(jsonString, serviceSchema);
}

export function parseInsuranceAccepted(jsonString: string | null): Insurance[] {
  return safeJsonParseArray(jsonString, insuranceSchema);
}

export function parseConditionsTreated(jsonString: string | null): Condition[] {
  return safeJsonParseArray(jsonString, conditionSchema);
}

export function parseGalleryImages(jsonString: string | null): GalleryImage[] {
  return safeJsonParseArray(jsonString, galleryImageSchema);
}

export function parseSpecialties(jsonString: string | null): string[] {
  return safeJsonParseArray(jsonString, specialtySchema);
}

export function parseEducation(jsonString: string | null): Education[] {
  return safeJsonParseArray(jsonString, educationSchema);
}
