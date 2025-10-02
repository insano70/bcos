/**
 * Safely parse JSON strings with fallback values
 */
export function safeJsonParse<T>(jsonString: string | null | undefined | unknown, fallback: T): T {
  // If the value is null or undefined, return fallback
  if (jsonString == null) {
    return fallback;
  }

  // If the value is already parsed (not a string), return it
  if (typeof jsonString !== 'string') {
    return jsonString as T;
  }

  // If it's an empty string, return fallback
  if (jsonString.trim() === '') {
    return fallback;
  }

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('Failed to parse JSON:', jsonString, error);
    return fallback;
  }
}

/**
 * Parse business hours with fallback
 */
export function parseBusinessHours(jsonString: string | null | undefined | unknown) {
  return safeJsonParse(jsonString, {
    sunday: { closed: true },
    monday: { open: '09:00', close: '17:00', closed: false },
    tuesday: { open: '09:00', close: '17:00', closed: false },
    wednesday: { open: '09:00', close: '17:00', closed: false },
    thursday: { open: '09:00', close: '17:00', closed: false },
    friday: { open: '09:00', close: '17:00', closed: false },
    saturday: { closed: true },
  });
}

/**
 * Parse services array with fallback
 */
export function parseServices(jsonString: string | null | undefined | unknown) {
  return safeJsonParse(jsonString, []);
}

/**
 * Parse insurance array with fallback
 */
export function parseInsurance(jsonString: string | null | undefined | unknown) {
  return safeJsonParse(jsonString, [
    'Aetna',
    'Anthem Blue Cross Blue Shield',
    'Cigna',
    'Medicare',
    'UnitedHealthcare',
  ]);
}

/**
 * Parse insurance accepted array with fallback (alias for parseInsurance)
 */
export function parseInsuranceAccepted(jsonString: string | null | undefined | unknown) {
  return parseInsurance(jsonString);
}

/**
 * Parse conditions array with fallback
 */
export function parseConditions(jsonString: string | null | undefined | unknown) {
  return safeJsonParse(jsonString, []);
}

/**
 * Parse conditions treated array with fallback (alias for parseConditions)
 */
export function parseConditionsTreated(jsonString: string | null | undefined | unknown) {
  return parseConditions(jsonString);
}

/**
 * Parse specialties array with fallback
 */
export function parseSpecialties(jsonString: string | null | undefined | unknown) {
  return safeJsonParse(jsonString, []);
}

/**
 * Parse education array with fallback
 */
export function parseEducation(jsonString: string | null | undefined | unknown) {
  return safeJsonParse(jsonString, []);
}

/**
 * Parse gallery images array with fallback
 */
export function parseGalleryImages(jsonString: string | null | undefined | unknown) {
  return safeJsonParse(jsonString, []);
}
