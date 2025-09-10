import { NextRequest } from 'next/server'
import { FileUploadService } from '@/lib/api/services/upload'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { requireAuth } from '@/lib/api/middleware/auth'
import { AuditLogger } from '@/lib/api/services/audit'

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for uploads
    await applyRateLimit(request, 'upload')
    
    // Require authentication
    const session = await requireAuth(request)
    
    // Parse form data
    const data = await request.formData()
    const files: File[] = []
    
    // Handle multiple files
    for (const [key, value] of data.entries()) {
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
      userId: session.user.id,
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
    return createErrorResponse(error, 500, request)
  }
}