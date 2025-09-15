/**
 * Content Security Utilities
 * Provides safe rendering of user-generated content
 */

/**
 * Sanitize user names for safe display
 * Prevents XSS while allowing international characters
 */
export function sanitizeUserName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/["']/g, '') // Remove quotes
    .slice(0, 100); // Limit length
}

/**
 * Sanitize email for safe display
 */
export function sanitizeEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  return email
    .trim()
    .toLowerCase()
    .replace(/[<>"']/g, '')
    .slice(0, 255);
}

/**
 * Sanitize practice/organization names
 */
export function sanitizePracticeName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .trim()
    .replace(/[<>"']/g, '')
    .slice(0, 255);
}

/**
 * Sanitize bio/description content for safe display
 * Allows basic text formatting but removes dangerous content
 */
export function sanitizeBioContent(bio: string | null | undefined): string {
  if (!bio || typeof bio !== 'string') {
    return '';
  }

  return bio
    .trim()
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/[<>"']/g, '') // Remove dangerous characters
    .slice(0, 2000); // Limit length
}

/**
 * Sanitize phone numbers for display
 */
export function sanitizePhoneNumber(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') {
    return '';
  }

  return phone
    .trim()
    .replace(/[^0-9\s\-()+.]/g, '') // Only allow phone number characters
    .slice(0, 20);
}

/**
 * Sanitize URLs for safe display and linking
 */
export function sanitizeDisplayUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  // Remove dangerous protocols
  if (url.match(/^(javascript|data|vbscript|file):/i)) {
    return '';
  }

  return url.trim().slice(0, 500);
}

/**
 * React component for safely displaying user names
 */
interface SafeUserNameProps {
  firstName?: string | null;
  lastName?: string | null;
  className?: string;
}

export function SafeUserName({ firstName, lastName, className }: SafeUserNameProps) {
  const safeFirstName = sanitizeUserName(firstName);
  const safeLastName = sanitizeUserName(lastName);
  const fullName = `${safeFirstName} ${safeLastName}`.trim();
  
  return <span className={className}>{fullName || 'Unknown User'}</span>;
}

/**
 * React component for safely displaying practice content
 */
interface SafePracticeContentProps {
  content?: string | null;
  className?: string;
  maxLength?: number;
}

export function SafePracticeContent({ content, className, maxLength = 1000 }: SafePracticeContentProps) {
  const safeContent = sanitizeBioContent(content);
  const truncatedContent = safeContent.length > maxLength 
    ? `${safeContent.slice(0, maxLength)}...` 
    : safeContent;
  
  return <div className={className}>{truncatedContent || 'No content available'}</div>;
}
