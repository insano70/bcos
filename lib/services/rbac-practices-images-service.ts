import { and, eq, isNull } from 'drizzle-orm';
import { AuthorizationError, NotFoundError } from '@/lib/api/responses/error';
import { db, practice_attributes, staff_members } from '@/lib/db';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { verifyPracticeAccess } from './rbac-practice-utils';

/**
 * RBAC Practice Images Service
 * Handles database updates for practice image uploads with automatic RBAC
 *
 * This service complements the practices service by handling image-specific operations
 */

export type ImageType = 'logo' | 'hero' | 'gallery' | 'provider';

export interface UpdateImageResult {
  practiceId: string;
  fieldUpdated: string;
  url: string;
  totalImages?: number;
  staffId?: string;
}

export interface PracticeImagesServiceInterface {
  updatePracticeLogo(practiceId: string, imageUrl: string): Promise<UpdateImageResult>;
  updatePracticeHero(practiceId: string, imageUrl: string): Promise<UpdateImageResult>;
  addGalleryImage(practiceId: string, imageUrl: string): Promise<UpdateImageResult>;
  updateStaffPhoto(
    practiceId: string,
    staffId: string,
    imageUrl: string
  ): Promise<UpdateImageResult>;
}

/**
 * Create an RBAC-enabled practice images service instance
 */
export function createRBACPracticeImagesService(
  userContext: UserContext
): PracticeImagesServiceInterface {
  // Check permissions once at service creation
  const canUpdatePractices =
    userContext.is_super_admin ||
    userContext.all_permissions?.some(
      (p) => p.name === 'practices:update:own' || p.name === 'practices:manage:all'
    );

  const canManageStaff =
    userContext.is_super_admin ||
    userContext.all_permissions?.some(
      (p) => p.name === 'practices:staff:manage:own' || p.name === 'practices:manage:all'
    );

  /**
   * Update a practice attribute field with an image URL
   */
  async function updatePracticeAttributeField(
    practiceId: string,
    fieldName: string,
    imageUrl: string
  ): Promise<void> {
    await db
      .update(practice_attributes)
      .set({
        [fieldName]: imageUrl,
        updated_at: new Date(),
      })
      .where(eq(practice_attributes.practice_id, practiceId));
  }

  return {
    async updatePracticeLogo(practiceId: string, imageUrl: string): Promise<UpdateImageResult> {
      const startTime = Date.now();

      log.info('Update practice logo request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
      });

      try {
        if (!canUpdatePractices) {
          throw AuthorizationError('You do not have permission to update practices');
        }

        await verifyPracticeAccess(practiceId, userContext);
        await updatePracticeAttributeField(practiceId, 'logo_url', imageUrl);

        log.info('Practice logo updated successfully', {
          practiceId,
          duration: Date.now() - startTime,
        });

        return {
          practiceId,
          fieldUpdated: 'logo_url',
          url: imageUrl,
        };
      } catch (error) {
        log.error('Update practice logo failed', error, {
          practiceId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async updatePracticeHero(practiceId: string, imageUrl: string): Promise<UpdateImageResult> {
      const startTime = Date.now();

      log.info('Update practice hero image request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
      });

      try {
        if (!canUpdatePractices) {
          throw AuthorizationError('You do not have permission to update practices');
        }

        await verifyPracticeAccess(practiceId, userContext);
        await updatePracticeAttributeField(practiceId, 'hero_image_url', imageUrl);

        log.info('Practice hero image updated successfully', {
          practiceId,
          duration: Date.now() - startTime,
        });

        return {
          practiceId,
          fieldUpdated: 'hero_image_url',
          url: imageUrl,
        };
      } catch (error) {
        log.error('Update practice hero image failed', error, {
          practiceId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async addGalleryImage(practiceId: string, imageUrl: string): Promise<UpdateImageResult> {
      const startTime = Date.now();

      log.info('Add gallery image request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
      });

      try {
        if (!canUpdatePractices) {
          throw AuthorizationError('You do not have permission to update practices');
        }

        await verifyPracticeAccess(practiceId, userContext);

        // Get current gallery images
        const [currentAttributes] = await db
          .select({ gallery_images: practice_attributes.gallery_images })
          .from(practice_attributes)
          .where(eq(practice_attributes.practice_id, practiceId))
          .limit(1);

        // Parse existing gallery images
        let existingImages: string[] = [];
        if (currentAttributes?.gallery_images) {
          try {
            const parsed = JSON.parse(currentAttributes.gallery_images);
            existingImages = Array.isArray(parsed) ? parsed : [];
          } catch (parseError) {
            log.warn('Failed to parse existing gallery images, starting fresh', {
              practiceId,
              error: parseError,
            });
            existingImages = [];
          }
        }

        // Add new image to gallery
        const updatedImages = [...existingImages, imageUrl];

        // Update gallery_images array
        await db
          .update(practice_attributes)
          .set({
            gallery_images: JSON.stringify(updatedImages),
            updated_at: new Date(),
          })
          .where(eq(practice_attributes.practice_id, practiceId));

        log.info('Gallery image added successfully', {
          practiceId,
          totalImages: updatedImages.length,
          duration: Date.now() - startTime,
        });

        return {
          practiceId,
          fieldUpdated: 'gallery_images',
          url: imageUrl,
          totalImages: updatedImages.length,
        };
      } catch (error) {
        log.error('Add gallery image failed', error, {
          practiceId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },

    async updateStaffPhoto(
      practiceId: string,
      staffId: string,
      imageUrl: string
    ): Promise<UpdateImageResult> {
      const startTime = Date.now();

      log.info('Update staff photo request initiated', {
        requestingUserId: userContext.user_id,
        practiceId,
        staffId,
      });

      try {
        if (!canManageStaff) {
          throw AuthorizationError('You do not have permission to manage staff');
        }

        // Verify practice access first
        await verifyPracticeAccess(practiceId, userContext);

        // Verify staff member exists and belongs to this practice
        const [existingStaff] = await db
          .select()
          .from(staff_members)
          .where(
            and(
              eq(staff_members.staff_id, staffId),
              eq(staff_members.practice_id, practiceId),
              isNull(staff_members.deleted_at)
            )
          )
          .limit(1);

        if (!existingStaff) {
          throw NotFoundError('Staff member');
        }

        // Update staff photo
        await db
          .update(staff_members)
          .set({
            photo_url: imageUrl,
            updated_at: new Date(),
          })
          .where(
            and(eq(staff_members.staff_id, staffId), eq(staff_members.practice_id, practiceId))
          );

        log.info('Staff photo updated successfully', {
          practiceId,
          staffId,
          duration: Date.now() - startTime,
        });

        return {
          practiceId,
          fieldUpdated: 'photo_url',
          url: imageUrl,
          staffId,
        };
      } catch (error) {
        log.error('Update staff photo failed', error, {
          practiceId,
          staffId,
          userId: userContext.user_id,
          duration: Date.now() - startTime,
        });
        throw error;
      }
    },
  };
}
