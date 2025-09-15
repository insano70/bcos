import { NextRequest } from 'next/server'
import { FileUploadService } from '@/lib/api/services/upload'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { rbacRoute } from '@/lib/api/rbac-route-handler'
import { AuditLogger } from '@/lib/api/services/audit'
import type { UserContext } from '@/lib/types/rbac'

const uploadFilesHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    
    // Parse form data
    const data = await request.formData()
    const files: File[] = []
    
    // Handle multiple files
    const entries = Array.from(data.entries())
    for (const [key, value] of entries) {
      if (key.startsWith('file') && value instanceof File) {
        files.push(value)
      }
    }
    
    if (files.length === 0) {
      return createErrorResponse('No files uploaded', 400, request)
    }

    // Get upload options from form data
    const folder = (data.get('folder') as string) || 'uploads'
    const optimizeImages = (data.get('optimizeImages') as string) !== 'false'
    const generateThumbnails = (data.get('generateThumbnails') as string) !== 'false'
    
    // Get practice-specific data
    const practiceId = data.get('practiceId') as string
    const imageType = data.get('type') as string // 'logo' | 'hero' | 'provider' | 'gallery'

    // Upload files
    const result = await FileUploadService.uploadFiles(files, {
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
    return createSuccessResponse(result.files, 'Files uploaded successfully')
    
  } catch (error) {
    console.error('Upload error:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
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