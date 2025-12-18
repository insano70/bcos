/**
 * Avatar utility functions for consistent avatar rendering across the application.
 */

/**
 * 8-color palette for avatar backgrounds.
 * Colors chosen for accessibility and visual distinction.
 */
const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-red-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
] as const;

/**
 * Avatar size presets matching common UI patterns.
 */
export const AVATAR_SIZES = {
  xs: { container: 'w-4 h-4', text: 'text-[10px]' }, // 16px - Compact tags
  sm: { container: 'w-6 h-6', text: 'text-xs' }, // 24px - Dropdowns
  md: { container: 'w-8 h-8', text: 'text-sm' }, // 32px - Lists, modals
  lg: { container: 'w-10 h-10', text: 'text-sm' }, // 40px - Tables
  xl: { container: 'w-12 h-12', text: 'text-base' }, // 48px - Profiles
  '2xl': { container: 'w-16 h-16', text: 'text-lg' }, // 64px - Cards
} as const;

export type AvatarSize = keyof typeof AVATAR_SIZES;

/**
 * Generate initials from a name.
 * Supports both full name strings and separate first/last name parameters.
 *
 * @example
 * getInitials('John Doe') // 'JD'
 * getInitials('John') // 'J'
 * getInitials('John', 'Doe') // 'JD'
 */
export function getInitials(firstName: string, lastName?: string): string {
  if (lastName !== undefined) {
    // Two-parameter form: getInitials(firstName, lastName)
    const firstInitial = firstName.charAt(0) || '';
    const lastInitial = lastName.charAt(0) || '';
    return `${firstInitial}${lastInitial}`.toUpperCase();
  }

  // Single-parameter form: getInitials(fullName)
  const fullName = firstName;
  const parts = fullName.trim().split(/\s+/);

  if (parts.length >= 2) {
    const firstPart = parts[0];
    const secondPart = parts[1];
    const firstInitial = firstPart?.charAt(0) ?? '';
    const secondInitial = secondPart?.charAt(0) ?? '';
    return `${firstInitial}${secondInitial}`.toUpperCase();
  }

  return (fullName.charAt(0) || '?').toUpperCase();
}

/**
 * Generate a consistent avatar background color based on a unique identifier.
 * The same identifier will always produce the same color.
 *
 * @param identifier - Unique string (typically user ID or email)
 * @returns Tailwind background color class
 *
 * @example
 * getAvatarColor('user-123') // 'bg-purple-500' (consistent for this ID)
 */
export function getAvatarColor(identifier: string): string {
  if (!identifier) return 'bg-gray-500';

  const hash = identifier.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  const index = hash % AVATAR_COLORS.length;
  return AVATAR_COLORS[index] ?? 'bg-gray-500';
}
