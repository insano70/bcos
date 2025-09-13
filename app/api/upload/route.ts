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

    return createSuccessResponse(result.files, 'Files uploaded successfully')
    
  } catch (error) {
    console.error('Upload error:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request)
  }
}

// Export with RBAC protection - file uploads require write API access
export const POST = rbacRoute(
  uploadFilesHandler,
  {
    permission: 'api:write:organization',
    rateLimit: 'upload'
  }
);