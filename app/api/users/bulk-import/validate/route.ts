import { NextResponse, type NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { createBulkUserImportService } from '@/lib/services/bulk-user-import-service';
import type { UserContext } from '@/lib/types/rbac';
import { CSV_FILE_SIZE_LIMIT, parseCSV } from '@/lib/utils/csv-import';

/**
 * POST /api/users/bulk-import/validate
 *
 * Validate a CSV file for bulk user import.
 * Parses the CSV, validates all rows, and resolves organization/role names.
 * Does not create any users - returns validation results for preview.
 */
const validateHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file provided', message: 'Please upload a CSV file' },
        { status: 400 }
      );
    }

    // Validate file type
    const hasValidExtension = file.name.toLowerCase().endsWith('.csv');
    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (!validTypes.includes(file.type) && !hasValidExtension) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type', message: 'Please upload a CSV file' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > CSV_FILE_SIZE_LIMIT) {
      return NextResponse.json(
        { success: false, error: 'File too large', message: 'File exceeds maximum size of 5MB' },
        { status: 400 }
      );
    }

    // Check if file is empty
    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'Empty file', message: 'The uploaded file is empty' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();

    // Parse CSV
    const parseResult = parseCSV(content);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'CSV parsing failed', message: parseResult.error },
        { status: 400 }
      );
    }

    // Validate rows using service
    const service = createBulkUserImportService(userContext);
    const validatedRows = await service.validateRows(parseResult.data);

    // Calculate counts
    const validCount = validatedRows.filter((r) => r.is_valid).length;
    const invalidCount = validatedRows.filter((r) => !r.is_valid).length;

    const duration = Date.now() - startTime;

    log.info('bulk import validation completed', {
      operation: 'validate_bulk_import',
      userId: userContext.user_id,
      duration,
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        totalRows: validatedRows.length,
        validRows: validCount,
        invalidRows: invalidCount,
        component: 'api',
      },
    });

    return createSuccessResponse({
      valid_count: validCount,
      invalid_count: invalidCount,
      total_count: validatedRows.length,
      rows: validatedRows,
    });
  } catch (error) {
    log.error('bulk import validation failed', error, {
      operation: 'validate_bulk_import',
      userId: userContext.user_id,
      component: 'api',
    });

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return NextResponse.json(
      { success: false, error: 'Validation failed', message },
      { status: 500 }
    );
  }
};

export const POST = rbacRoute(validateHandler, {
  permission: 'users:create:organization',
  rateLimit: 'upload',
});
