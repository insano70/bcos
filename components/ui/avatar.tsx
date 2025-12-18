'use client';

import { forwardRef, useState } from 'react';
import Image from 'next/image';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getInitials,
  getAvatarColor,
  AVATAR_SIZES,
  type AvatarSize,
} from '@/lib/utils/avatar';

interface AvatarProps {
  /** Size preset */
  size?: AvatarSize;
  /** Image URL (optional - falls back to initials) */
  src?: string | null;
  /** Display name for initials generation */
  name?: string;
  /** First name (alternative to name) */
  firstName?: string;
  /** Last name (alternative to name) */
  lastName?: string;
  /** Unique identifier for consistent color (typically user ID) */
  userId?: string;
  /** Custom background color class (overrides userId-based color) */
  colorClass?: string;
  /** Additional CSS classes */
  className?: string;
  /** Alt text for image */
  alt?: string;
}

const ICON_SIZES: Record<AvatarSize, string> = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  xl: 'h-6 w-6',
  '2xl': 'h-8 w-8',
};

interface ImageAvatarProps {
  src: string;
  alt: string;
  sizeConfig: (typeof AVATAR_SIZES)[AvatarSize];
  className?: string | undefined;
}

/**
 * Internal component to handle image avatars with fallback on error.
 */
const ImageAvatar = forwardRef<HTMLDivElement, ImageAvatarProps>(
  ({ src, alt, sizeConfig, className }, ref) => {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
      // Fallback to icon on error
      return (
        <div
          ref={ref}
          className={cn(
            'rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 flex-shrink-0',
            sizeConfig.container,
            className
          )}
        >
          <User className={cn('text-gray-600 dark:text-gray-400', ICON_SIZES.md)} />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-full overflow-hidden flex-shrink-0',
          sizeConfig.container,
          className
        )}
      >
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          onError={() => setHasError(true)}
        />
      </div>
    );
  }
);

ImageAvatar.displayName = 'ImageAvatar';

/**
 * Avatar component with consistent styling across the application.
 *
 * @example
 * // With full name
 * <Avatar name="John Doe" userId="user-123" size="md" />
 *
 * // With separate first/last name
 * <Avatar firstName="John" lastName="Doe" userId="user-123" />
 *
 * // With image
 * <Avatar src="/avatars/john.jpg" name="John Doe" size="lg" />
 *
 * // Minimal (icon fallback)
 * <Avatar size="sm" />
 */
const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      size = 'md',
      src,
      name,
      firstName,
      lastName,
      userId,
      colorClass,
      className,
      alt,
    },
    ref
  ) => {
    const sizeConfig = AVATAR_SIZES[size];

    // Generate initials
    let initials = '';
    if (firstName && lastName) {
      initials = getInitials(firstName, lastName);
    } else if (name) {
      initials = getInitials(name);
    }

    // Generate color
    const bgColor = colorClass ?? (userId ? getAvatarColor(userId) : 'bg-gray-500');

    // If we have a valid image URL, show image
    if (src) {
      return (
        <ImageAvatar
          ref={ref}
          src={src}
          alt={alt ?? name ?? 'Avatar'}
          sizeConfig={sizeConfig}
          className={className}
        />
      );
    }

    // If we have initials, show initials
    if (initials) {
      return (
        <div
          ref={ref}
          className={cn(
            'rounded-full flex items-center justify-center text-white font-medium flex-shrink-0',
            sizeConfig.container,
            sizeConfig.text,
            bgColor,
            className
          )}
        >
          {initials}
        </div>
      );
    }

    // Fallback: generic user icon
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 flex-shrink-0',
          sizeConfig.container,
          className
        )}
      >
        <User className={cn('text-gray-600 dark:text-gray-400', ICON_SIZES[size])} />
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export { Avatar };
export type { AvatarProps };
