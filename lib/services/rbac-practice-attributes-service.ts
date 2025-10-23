import { eq } from 'drizzle-orm';
import { AuthorizationError, NotFoundError } from '@/lib/api/responses/error';
import { db, practice_attributes } from '@/lib/db';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import {
  parseBusinessHours,
  parseConditionsTreated,
  parseGalleryImages,
  parseInsuranceAccepted,
  parseServices,
} from '@/lib/utils/json-parser';
import { verifyPracticeAccess } from './rbac-practice-utils';

/**
 * RBAC Practice Attributes Service
 * Manages practice attributes CRUD operations with automatic permission checking
 */

export interface PracticeAttributesData {
  practice_id: string | null;
  business_hours?: unknown;
  services?: unknown;
  insurance_accepted?: unknown;
  conditions_treated?: unknown;
  gallery_images?: unknown;
  logo_url?: string | null;
  hero_image_url?: string | null;
  hero_overlay_opacity?: number;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  updated_at: Date | null;
}

export interface UpdatePracticeAttributesData {
  business_hours?: unknown;
  services?: unknown;
  insurance_accepted?: unknown;
  conditions_treated?: unknown;
  gallery_images?: unknown;
  logo_url?: string | null | undefined;
  hero_image_url?: string | null | undefined;
  hero_overlay_opacity?: number | undefined;
  primary_color?: string | null | undefined;
  secondary_color?: string | null | undefined;
  accent_color?: string | null | undefined;
}

export interface PracticeAttributesServiceInterface {
  getPracticeAttributes(practiceId: string): Promise<PracticeAttributesData>;
  updatePracticeAttributes(
    practiceId: string,
    data: UpdatePracticeAttributesData
  ): Promise<PracticeAttributesData>;
}

/**
 * Create an RBAC-enabled practice attributes service instance
 *
 * Handles all practice attributes operations with automatic permission enforcement.
 * Manages extended practice data including business hours, services, insurance, conditions, and gallery.
 *
 * @param userContext - The authenticated user context with permissions
 * @returns Service interface with getPracticeAttributes and updatePracticeAttributes methods
 *
 * @example
 * ```typescript
 * const attributesService = createRBACPracticeAttributesService(userContext);
 * const attributes = await attributesService.getPracticeAttributes(practiceId);
 * ```
 *
 * Permissions required:
 * - Read: Automatic (practice owner or super admin)
 * - Update: practices:update:own or practices:manage:all
 */
export function createRBACPracticeAttributesService(
  userContext: UserContext
): PracticeAttributesServiceInterface {
  // Check permissions once at service creation
  const canUpdate =
    userContext.is_super_admin ||
    userContext.all_permissions?.some(
      (p) => p.name === 'practices:update:own' || p.name === 'practices:manage:all'
    );

  return {
    async getPracticeAttributes(practiceId: string): Promise<PracticeAttributesData> {
      const startTime = Date.now();

      log.info('Get practice attributes request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
      });

      try {
        // Verify access
        await verifyPracticeAccess(practiceId, userContext);

        // Get practice attributes
        const [attributes] = await db
          .select()
          .from(practice_attributes)
          .where(eq(practice_attributes.practice_id, practiceId))
          .limit(1);

        if (!attributes) {
          throw NotFoundError('Practice attributes');
        }

        // Parse JSON fields safely
        const parsedAttributes: PracticeAttributesData = {
          practice_id: attributes.practice_id,
          business_hours: parseBusinessHours(attributes.business_hours),
          services: parseServices(attributes.services),
          insurance_accepted: parseInsuranceAccepted(attributes.insurance_accepted),
          conditions_treated: parseConditionsTreated(attributes.conditions_treated),
          gallery_images: parseGalleryImages(attributes.gallery_images),
          logo_url: attributes.logo_url,
          hero_image_url: attributes.hero_image_url,
          hero_overlay_opacity: attributes.hero_overlay_opacity ?? 0.1,
          primary_color: attributes.primary_color,
          secondary_color: attributes.secondary_color,
          accent_color: attributes.accent_color,
          updated_at: attributes.updated_at,
        };

        log.info('Get practice attributes completed', {
          practiceId,
          duration: Date.now() - startTime,
        });

        return parsedAttributes;
      } catch (error) {
        log.error('Get practice attributes failed', error, {
          practiceId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async updatePracticeAttributes(
      practiceId: string,
      data: UpdatePracticeAttributesData
    ): Promise<PracticeAttributesData> {
      const startTime = Date.now();

      log.info('Update practice attributes request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
      });

      try {
        // Check permission
        if (!canUpdate) {
          throw AuthorizationError('You do not have permission to update practice attributes');
        }

        // Verify access
        await verifyPracticeAccess(practiceId, userContext);

        // Prepare data for update, stringify JSON fields
        const updateData = {
          ...data,
          business_hours: data.business_hours ? JSON.stringify(data.business_hours) : undefined,
          services: data.services ? JSON.stringify(data.services) : undefined,
          insurance_accepted: data.insurance_accepted
            ? JSON.stringify(data.insurance_accepted)
            : undefined,
          conditions_treated: data.conditions_treated
            ? JSON.stringify(data.conditions_treated)
            : undefined,
          gallery_images: data.gallery_images ? JSON.stringify(data.gallery_images) : undefined,
          updated_at: new Date(),
        };

        // Update practice attributes
        const [updatedAttributes] = await db
          .update(practice_attributes)
          .set(updateData)
          .where(eq(practice_attributes.practice_id, practiceId))
          .returning();

        if (!updatedAttributes) {
          throw NotFoundError('Practice attributes');
        }

        // Parse JSON fields for response
        const parsedAttributes: PracticeAttributesData = {
          practice_id: updatedAttributes.practice_id,
          business_hours: parseBusinessHours(updatedAttributes.business_hours),
          services: parseServices(updatedAttributes.services),
          insurance_accepted: parseInsuranceAccepted(updatedAttributes.insurance_accepted),
          conditions_treated: parseConditionsTreated(updatedAttributes.conditions_treated),
          gallery_images: parseGalleryImages(updatedAttributes.gallery_images),
          logo_url: updatedAttributes.logo_url,
          hero_image_url: updatedAttributes.hero_image_url,
          hero_overlay_opacity: updatedAttributes.hero_overlay_opacity ?? 0.1,
          primary_color: updatedAttributes.primary_color,
          secondary_color: updatedAttributes.secondary_color,
          accent_color: updatedAttributes.accent_color,
          updated_at: updatedAttributes.updated_at,
        };

        log.info('Update practice attributes completed', {
          practiceId,
          duration: Date.now() - startTime,
        });

        return parsedAttributes;
      } catch (error) {
        log.error('Update practice attributes failed', error, {
          practiceId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },
  };
}
