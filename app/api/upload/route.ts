import { NextRequest } from 'next/server'
import { uploadFiles } from '@/lib/api/services/upload'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { rbacRoute } from '@/lib/api/rbac-route-handler'
import type { UserContext } from '@/lib/types/rbac'
import { log } from '@/lib/logger'
import { AuditLogger } from '@/lib/api/services/audit'
import { createRBACPracticeImagesService } from '@/lib/services/rbac-practices-images-service'

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

    // If this is a practice image upload, update the database using the service
    if (practiceId && imageType && result.files.length === 1) {
      const fileUrl = result.files[0]?.fileUrl

      try {
        // Use the RBAC practice images service
        const practiceImagesService = createRBACPracticeImagesService(userContext);

        let updateResult;

        // Route to appropriate service method based on image type
        switch (imageType) {
          case 'gallery':
            updateResult = await practiceImagesService.addGalleryImage(practiceId, fileUrl);
            break;

          case 'logo':
            updateResult = await practiceImagesService.updatePracticeLogo(practiceId, fileUrl);
            break;

          case 'hero':
            updateResult = await practiceImagesService.updatePracticeHero(practiceId, fileUrl);
            break;

          case 'provider': {
            const staffId = data.get('staffId') as string;
            if (!staffId) {
              return createErrorResponse('Staff ID is required for provider photo uploads', 400, request);
            }
            updateResult = await practiceImagesService.updateStaffPhoto(practiceId, staffId, fileUrl);
            break;
          }

          default:
            // Unknown image type, continue to generic file response
            break;
        }

        if (updateResult) {
          const totalDuration = Date.now() - startTime;
          log.info('Practice image uploaded successfully', {
            userId: userContext.user_id,
            practiceId: updateResult.practiceId,
            fieldUpdated: updateResult.fieldUpdated,
            imageType,
            duration: totalDuration
          });

          return createSuccessResponse({
            url: updateResult.url,
            fileName: result.files[0]?.fileName,
            fieldUpdated: updateResult.fieldUpdated,
            practiceId: updateResult.practiceId,
            totalImages: updateResult.totalImages,
            staffId: updateResult.staffId
          }, 'File uploaded and practice updated successfully');
        }

      } catch (dbError) {
        console.error('Database update failed after file upload:', dbError);
        return createErrorResponse(
          dbError instanceof Error ? dbError.message : 'File uploaded but failed to update practice',
          500,
          request
        );
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