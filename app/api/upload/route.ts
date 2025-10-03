import { NextRequest } from 'next/server'
import { uploadFiles } from '@/lib/api/services/upload'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { rbacRoute } from '@/lib/api/rbac-route-handler'
import { AuditLogger } from '@/lib/api/services/audit'
import type { UserContext } from '@/lib/types/rbac'
import { log } from '@/lib/logger'

const uploadFilesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now()

  log.info('File upload request initiated', {
    userId: userContext.user_id,
    endpoint: '/api/upload',
    method: 'POST'
  })

  try {
    // Parse form data
    const formDataStartTime = Date.now()
    const data = await request.formData()
    log.info('Form data parsed', { duration: Date.now() - formDataStartTime })
    const files: File[] = []

    // Handle multiple files
    const entries = Array.from(data.entries())
    for (const [key, value] of entries) {
      if (key.startsWith('file') && value instanceof File) {
        files.push(value)
      }
    }

    if (files.length === 0) {
      log.warn('No files provided in upload request', {
        userId: userContext.user_id
      })
      return createErrorResponse('No files uploaded', 400, request)
    }

    log.debug('Files parsed from form data', {
      fileCount: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0)
    })

    // Get upload options from form data
    const folder = (data.get('folder') as string) || 'uploads'
    const optimizeImages = (data.get('optimizeImages') as string) !== 'false'
    const generateThumbnails = (data.get('generateThumbnails') as string) !== 'false'
    
    // Get practice-specific data
    const practiceId = data.get('practiceId') as string
    const imageType = data.get('type') as string // 'logo' | 'hero' | 'provider' | 'gallery'

    // Upload files
    const uploadStartTime = Date.now()
    const result = await uploadFiles(files, {
      folder,
      optimizeImages,
      generateThumbnails,
      allowedTypes: [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf', 'text/plain'
      ],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
    log.info('File upload service completed', {
      duration: Date.now() - uploadStartTime,
      fileCount: files.length,
      success: result.success
    })

    // Log the upload action
    const requestInfo = AuditLogger.extractRequestInfo(request)
    await AuditLogger.logUserAction({
      action: 'file_upload',
      userId: userContext.user_id,
      resourceType: 'file',
      resourceId: result.files.map(f => f.fileName).join(','),
      ipAddress: requestInfo.ipAddress,
      userAgent: requestInfo.userAgent,
      metadata: {
        fileCount: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        folder,
        success: result.success
      }
    })

    if (!result.success) {
      return createErrorResponse(result.errors.join(', '), 400, request)
    }

    // If this is a practice image upload, update the database directly
    if (practiceId && imageType && result.files.length === 1) {
      const fileUrl = result.files[0]?.fileUrl
      
      // Update practice attributes or staff members based on image type
      const practiceFieldMapping: Record<string, string> = {
        'logo': 'logo_url',
        'hero': 'hero_image_url'
      }
      
      const staffFieldMapping: Record<string, string> = {
        'provider': 'photo_url'
      }
      
      // Handle gallery images separately (array append)
      if (imageType === 'gallery') {
        try {
          // Import here to avoid circular dependencies
          const { db, practice_attributes, practices } = await import('@/lib/db')
          const { eq, and, isNull } = await import('drizzle-orm')
          
          // SECURITY: Verify user has permission to update this practice
          const [practice] = await db
            .select()
            .from(practices)
            .where(and(
              eq(practices.practice_id, practiceId),
              isNull(practices.deleted_at)
            ))
            .limit(1)
          
          if (!practice) {
            return createErrorResponse('Practice not found', 404, request)
          }
          
          // Check if user can update this practice
          const canUpdatePractice = userContext.all_permissions?.some(p =>
            p.name === 'practices:update:own' || p.name === 'practices:manage:all'
          ) || false
          
          const isOwner = practice.owner_user_id === userContext.user_id
          const isSuperAdmin = userContext.is_super_admin
          
          if (!canUpdatePractice || (!isOwner && !isSuperAdmin)) {
            return createErrorResponse('You do not have permission to update this practice', 403, request)
          }
          
          // Get current gallery images
          const [currentAttributes] = await db
            .select({ gallery_images: practice_attributes.gallery_images })
            .from(practice_attributes)
            .where(eq(practice_attributes.practice_id, practiceId))
            .limit(1)
          
          // Parse existing gallery images
          let existingImages: string[] = []
          if (currentAttributes?.gallery_images) {
            try {
              existingImages = JSON.parse(currentAttributes.gallery_images)
            } catch {
              existingImages = []
            }
          }
          
          // Add new image to gallery
          const updatedImages = [...existingImages, fileUrl]
          
          // Update gallery_images array
          await db
            .update(practice_attributes)
            .set({
              gallery_images: JSON.stringify(updatedImages),
              updated_at: new Date()
            })
            .where(eq(practice_attributes.practice_id, practiceId))
            
          const totalDuration = Date.now() - startTime
          log.info('Gallery image uploaded successfully', {
            userId: userContext.user_id,
            practiceId,
            totalImages: updatedImages.length,
            duration: totalDuration
          })

          return createSuccessResponse({
            url: fileUrl,
            fileName: result.files[0]?.fileName,
            fieldUpdated: 'gallery_images',
            practiceId,
            totalImages: updatedImages.length
          }, 'Gallery image uploaded successfully')
          
        } catch (dbError) {
          console.error('Database update failed after gallery upload:', dbError)
          return createErrorResponse('File uploaded but failed to update gallery', 500, request)
        }
      }
      
      const practiceFieldName = practiceFieldMapping[imageType]
      if (practiceFieldName) {
        try {
          // Import here to avoid circular dependencies
          const { db, practice_attributes, practices } = await import('@/lib/db')
          const { eq, and, isNull } = await import('drizzle-orm')
          
          // SECURITY: Verify user has permission to update this practice
          const [practice] = await db
            .select()
            .from(practices)
            .where(and(
              eq(practices.practice_id, practiceId),
              isNull(practices.deleted_at)
            ))
            .limit(1)
          
          if (!practice) {
            return createErrorResponse('Practice not found', 404, request)
          }
          
          // Check if user can update this practice
          const canUpdatePractice = userContext.all_permissions?.some(p =>
            p.name === 'practices:update:own' || p.name === 'practices:manage:all'
          ) || false
          
          const isOwner = practice.owner_user_id === userContext.user_id
          const isSuperAdmin = userContext.is_super_admin
          
          if (!canUpdatePractice || (!isOwner && !isSuperAdmin)) {
            return createErrorResponse('You do not have permission to update this practice', 403, request)
          }
          
          // Now safe to update
          await db
            .update(practice_attributes)
            .set({
              [practiceFieldName]: fileUrl,
              updated_at: new Date()
            })
            .where(eq(practice_attributes.practice_id, practiceId))
            
          const totalDuration = Date.now() - startTime
          log.info('Practice image uploaded successfully', {
            userId: userContext.user_id,
            practiceId,
            fieldUpdated: practiceFieldName,
            duration: totalDuration
          })

          return createSuccessResponse({
            url: fileUrl,
            fileName: result.files[0]?.fileName,
            fieldUpdated: practiceFieldName,
            practiceId
          }, 'File uploaded and practice updated successfully')
          
        } catch (dbError) {
          console.error('Database update failed after file upload:', dbError)
          // File was uploaded successfully, but DB update failed
          return createErrorResponse('File uploaded but failed to update practice', 500, request)
        }
      }
      
      // Handle staff photo uploads
      const staffFieldName = staffFieldMapping[imageType]
      if (staffFieldName) {
        const staffId = data.get('staffId') as string
        if (!staffId) {
          return createErrorResponse('Staff ID is required for provider photo uploads', 400, request)
        }
        
        try {
          // Import here to avoid circular dependencies
          const { db, staff_members, practices } = await import('@/lib/db')
          const { eq, and, isNull } = await import('drizzle-orm')
          
          // SECURITY: Verify user has permission to update this practice's staff
          const [practice] = await db
            .select()
            .from(practices)
            .where(and(
              eq(practices.practice_id, practiceId),
              isNull(practices.deleted_at)
            ))
            .limit(1)
          
          if (!practice) {
            return createErrorResponse('Practice not found', 404, request)
          }
          
          // Check if user can manage this practice's staff
          const canManageStaff = userContext.all_permissions?.some(p =>
            p.name === 'practices:staff:manage:own' || p.name === 'practices:manage:all'
          ) || false
          
          const isOwner = practice.owner_user_id === userContext.user_id
          const isSuperAdmin = userContext.is_super_admin
          
          if (!canManageStaff || (!isOwner && !isSuperAdmin)) {
            return createErrorResponse('You do not have permission to update staff for this practice', 403, request)
          }
          
          // Verify staff member exists and belongs to this practice
          const [existingStaff] = await db
            .select()
            .from(staff_members)
            .where(and(
              eq(staff_members.staff_id, staffId),
              eq(staff_members.practice_id, practiceId),
              isNull(staff_members.deleted_at)
            ))
            .limit(1)
          
          if (!existingStaff) {
            return createErrorResponse('Staff member not found', 404, request)
          }
          
          // Now safe to update
          await db
            .update(staff_members)
            .set({
              [staffFieldName]: fileUrl,
              updated_at: new Date()
            })
            .where(and(
              eq(staff_members.staff_id, staffId),
              eq(staff_members.practice_id, practiceId)
            ))
            
          const totalDuration = Date.now() - startTime
          log.info('Staff photo uploaded successfully', {
            userId: userContext.user_id,
            practiceId,
            staffId,
            fieldUpdated: staffFieldName,
            duration: totalDuration
          })

          return createSuccessResponse({
            url: fileUrl,
            fileName: result.files[0]?.fileName,
            fieldUpdated: staffFieldName,
            practiceId,
            staffId
          }, 'File uploaded and staff member updated successfully')
          
        } catch (dbError) {
          console.error('Database update failed after staff photo upload:', dbError)
          // File was uploaded successfully, but DB update failed
          return createErrorResponse('File uploaded but failed to update staff member', 500, request)
        }
      }
    }

    // For single file uploads (non-practice or unsupported types), return the URL directly
    if (result.files.length === 1) {
      const totalDuration = Date.now() - startTime
      log.info('Single file upload completed successfully', {
        userId: userContext.user_id,
        fileName: result.files[0]?.fileName,
        fileSize: result.files[0]?.size,
        duration: totalDuration
      })

      return createSuccessResponse({
        url: result.files[0]?.fileUrl,
        fileName: result.files[0]?.fileName,
        originalName: result.files[0]?.originalName,
        size: result.files[0]?.size,
        mimeType: result.files[0]?.mimeType,
        thumbnail: result.files[0]?.thumbnail
      }, 'File uploaded successfully')
    }

    // For multiple files, return the array
    const totalDuration = Date.now() - startTime
    log.info('Multiple files upload completed successfully', {
      userId: userContext.user_id,
      fileCount: result.files.length,
      totalSize: result.files.reduce((sum, f) => sum + (f.size || 0), 0),
      duration: totalDuration
    })

    return createSuccessResponse(result.files, 'Files uploaded successfully')
    
  } catch (error) {
    const totalDuration = Date.now() - startTime

    log.error('Upload error', error, {
      userId: userContext.user_id,
      duration: totalDuration
    })

    const errorMessage = error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
    return createErrorResponse(errorMessage, 500, request)
  }
}

// Export with RBAC protection - file uploads require update permissions
// The handler internally checks specific permissions based on upload type
export const POST = rbacRoute(
  uploadFilesHandler,
  {
    permission: ['api:write:organization'],
    rateLimit: 'upload'
  }
);