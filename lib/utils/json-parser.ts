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
    monday: { open: '08:00', close: '17:00', closed: false },
    tuesday: { open: '08:00', close: '17:00', closed: false },
    wednesday: { open: '08:00', close: '17:00', closed: false },
    thursday: { open: '08:00', close: '17:00', closed: false },
    friday: { open: '08:00', close: '17:00', closed: false },
    saturday: { closed: true },
    sunday: { closed: true }
  });
}

/**
 * Parse services array with fallback
 */
export function parseServices(jsonString: string | null | undefined | unknown) {
  return safeJsonParse(jsonString, [
    'Rheumatoid Arthritis Treatment',
    'Lupus Management',
    'Infusion Therapy',
    'Joint Injections',
    'Osteoporosis Treatment',
    'Clinical Research'
  ]);
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
    'UnitedHealthcare'
  ]);
}

/**
 * Parse conditions array with fallback
 */
export function parseConditions(jsonString: string | null | undefined | unknown) {
  return safeJsonParse(jsonString, [
    'Rheumatoid Arthritis',
    'Psoriatic Arthritis',
    'Lupus',
    'Gout',
    'Osteoporosis',
    'Osteoarthritis'
  ]);
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
