import { type SQL, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log } from '@/lib/logger';
import { getAnalyticsDb } from '@/lib/services/analytics-db';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import type { UserContext } from '@/lib/types/rbac';
import { dataSourceParamsSchema } from '@/lib/validations/data-sources';
import { getDateRange } from '@/lib/utils/date-presets';

/**
 * Admin Data Sources Query API
 * Executes queries against a specific data source
 */

// Advanced filter schema for input validation
const advancedFilterSchema = z.array(
  z.object({
    field: z.string().min(1).max(200),
    operator: z.enum([
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'like',
      'not_like',
      'in',
      'not_in',
      'is_null',
      'is_not_null',
    ]),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
  })
);

// GET - Query data from data source
const queryDataSourceHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const dateRangePreset = searchParams.get('date_range_preset') || undefined;
    const providedStartDate = searchParams.get('start_date') || undefined;
    const providedEndDate = searchParams.get('end_date') || undefined;

    // Calculate dates: prefer preset calculation over provided dates
    const { startDate, endDate } = getDateRange(dateRangePreset, providedStartDate, providedEndDate);

    const practiceUid = searchParams.get('practice_uid');
    const advancedFiltersParam = searchParams.get('advanced_filters');

    // Parse and validate advanced filters if provided
    let advancedFilters: Array<{ field: string; operator: string; value: unknown }> = [];
    if (advancedFiltersParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(advancedFiltersParam));
        const validationResult = advancedFilterSchema.safeParse(parsed);

        if (!validationResult.success) {
          log.warn('Invalid advanced filters format', {
            error: validationResult.error,
            advancedFiltersParam,
          });
          return createErrorResponse('Invalid filter format', 400, request);
        }

        advancedFilters = validationResult.data;
      } catch (error) {
        log.warn('Failed to parse advanced filters JSON', { error, advancedFiltersParam });
        return createErrorResponse('Invalid JSON in advanced_filters parameter', 400, request);
      }
    }

    log.info('Data source query request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId,
      limit,
      startDate,
      endDate,
      practiceUid,
      advancedFiltersCount: advancedFilters.length,
    });

    // Get data source metadata
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const dataSource = await dataSourcesService.getDataSourceById(dataSourceId);

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    // Get active columns for this data source
    const columns = await dataSourcesService.getDataSourceColumns({
      data_source_id: dataSourceId,
      is_active: true,
    });

    if (columns.length === 0) {
      return createSuccessResponse({ data: [], total_count: 0 }, 'No active columns configured');
    }

    // Build the query
    const analyticsDb = getAnalyticsDb();
    const tableName = `${dataSource.schema_name}.${dataSource.table_name}`;

    // Build SELECT clause with all active columns
    const selectColumns = columns.map((col) => col.column_name).join(', ');

    // Build WHERE clause with proper SQL parameter binding
    const whereClauses: SQL[] = [];

    // Create allowed columns set for validation (SECURITY: prevent SQL injection)
    const allowedColumns = new Set(columns.map((col) => col.column_name));

    if (practiceUid) {
      whereClauses.push(sql`practice_uid = ${parseInt(practiceUid, 10)}`);
    }

    if (startDate) {
      // Find the date column - look for columns that are date fields
      const dateColumn = columns.find((col) => col.is_date_field);
      if (dateColumn) {
        // SECURITY FIX: Use parameterized query instead of sql.raw
        whereClauses.push(sql`${sql.identifier(dateColumn.column_name)} >= ${startDate}`);
      }
    }

    if (endDate) {
      const dateColumn = columns.find((col) => col.is_date_field);
      if (dateColumn) {
        // SECURITY FIX: Use parameterized query instead of sql.raw
        whereClauses.push(sql`${sql.identifier(dateColumn.column_name)} <= ${endDate}`);
      }
    }

    // Process advanced filters
    if (advancedFilters.length > 0) {
      for (const filter of advancedFilters) {
        const { field, operator, value } = filter;

        // Skip invalid filters
        if (!field || !operator || value === undefined || value === null) {
          log.warn('Skipping invalid advanced filter', { filter });
          continue;
        }

        // SECURITY FIX: Validate field name against allowed columns
        if (!allowedColumns.has(field)) {
          log.warn('Attempted to use invalid field name in filter', {
            field,
            allowedColumns: Array.from(allowedColumns),
            requestingUserId: userContext.user_id,
          });
          continue;
        }

        // Build SQL condition based on operator using parameterized queries
        switch (operator) {
          case 'eq':
            if (typeof value === 'string') {
              whereClauses.push(sql`${sql.identifier(field)} = ${value}`);
            } else if (typeof value === 'number') {
              whereClauses.push(sql`${sql.identifier(field)} = ${value}`);
            } else if (typeof value === 'boolean') {
              whereClauses.push(sql`${sql.identifier(field)} = ${value}`);
            }
            break;

          case 'neq':
            if (typeof value === 'string') {
              whereClauses.push(sql`${sql.identifier(field)} != ${value}`);
            } else if (typeof value === 'number') {
              whereClauses.push(sql`${sql.identifier(field)} != ${value}`);
            } else if (typeof value === 'boolean') {
              whereClauses.push(sql`${sql.identifier(field)} != ${value}`);
            }
            break;

          case 'gt':
            if (typeof value === 'number') {
              whereClauses.push(sql`${sql.identifier(field)} > ${value}`);
            } else if (typeof value === 'string') {
              whereClauses.push(sql`${sql.identifier(field)} > ${value}`);
            }
            break;

          case 'gte':
            if (typeof value === 'number') {
              whereClauses.push(sql`${sql.identifier(field)} >= ${value}`);
            } else if (typeof value === 'string') {
              whereClauses.push(sql`${sql.identifier(field)} >= ${value}`);
            }
            break;

          case 'lt':
            if (typeof value === 'number') {
              whereClauses.push(sql`${sql.identifier(field)} < ${value}`);
            } else if (typeof value === 'string') {
              whereClauses.push(sql`${sql.identifier(field)} < ${value}`);
            }
            break;

          case 'lte':
            if (typeof value === 'number') {
              whereClauses.push(sql`${sql.identifier(field)} <= ${value}`);
            } else if (typeof value === 'string') {
              whereClauses.push(sql`${sql.identifier(field)} <= ${value}`);
            }
            break;

          case 'like':
            if (typeof value === 'string') {
              // SECURITY FIX: Use parameterized query with LIKE pattern
              whereClauses.push(sql`${sql.identifier(field)} LIKE ${`%${value}%`}`);
            }
            break;

          case 'not_like':
            if (typeof value === 'string') {
              // SECURITY FIX: Use parameterized query with NOT LIKE pattern
              whereClauses.push(sql`${sql.identifier(field)} NOT LIKE ${`%${value}%`}`);
            }
            break;

          case 'in':
            if (Array.isArray(value) && value.length > 0) {
              // SECURITY FIX: Use parameterized query for IN clause
              whereClauses.push(sql`${sql.identifier(field)} IN ${value}`);
            }
            break;

          case 'not_in':
            if (Array.isArray(value) && value.length > 0) {
              // SECURITY FIX: Use parameterized query for NOT IN clause
              whereClauses.push(sql`${sql.identifier(field)} NOT IN ${value}`);
            }
            break;

          case 'is_null':
            whereClauses.push(sql`${sql.identifier(field)} IS NULL`);
            break;

          case 'is_not_null':
            whereClauses.push(sql`${sql.identifier(field)} IS NOT NULL`);
            break;

          default:
            log.warn('Unsupported filter operator', { operator, field });
        }
      }
    }

    // Build final query with proper parameter binding
    let query: SQL;
    if (whereClauses.length > 0) {
      const whereCondition = sql.join(whereClauses, sql` AND `);
      query = sql.raw(`SELECT ${selectColumns} FROM ${tableName} WHERE `);
      query = sql.join([query, whereCondition, sql.raw(` LIMIT ${limit}`)], sql``);
    } else {
      query = sql.raw(`SELECT ${selectColumns} FROM ${tableName} LIMIT ${limit}`);
    }

    log.info('Executing data source query', {
      dataSourceId,
      tableName,
      columnsCount: columns.length,
      hasFilters: whereClauses.length > 0,
    });

    // Execute query
    const result = await analyticsDb.execute(query);
    const rows = result as unknown as Record<string, unknown>[];

    log.info('Data source query completed', {
      dataSourceId,
      rowCount: rows.length,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse(
      {
        data: rows,
        total_count: rows.length,
        columns: columns.map((col) => ({
          name: col.column_name,
          display_name: col.display_name,
          data_type: col.data_type,
          format_type: col.format_type,
          display_icon: col.display_icon,
          icon_type: col.icon_type,
          icon_color_mode: col.icon_color_mode,
          icon_color: col.icon_color,
          icon_mapping: col.icon_mapping,
        })),
      },
      `Retrieved ${rows.length} rows`
    );
  } catch (error) {
    log.error('Data source query error', error, {
      requestingUserId: userContext.user_id,
      dataSourceId,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(queryDataSourceHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api',
});

// Disable caching for this route - always fetch fresh data from analytics database
export const dynamic = 'force-dynamic';
export const revalidate = 0;
