import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractRouteParams } from '@/lib/api/utils/params';
import { dataSourceParamsSchema } from '@/lib/validations/data-sources';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import { getAnalyticsDb } from '@/lib/services/analytics-db';
import { sql, SQL } from 'drizzle-orm';

/**
 * Admin Data Sources Query API
 * Executes queries against a specific data source
 */

// GET - Query data from data source
const queryDataSourceHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const practiceUid = searchParams.get('practice_uid');
    const advancedFiltersParam = searchParams.get('advanced_filters');

    // Parse advanced filters if provided
    let advancedFilters: Array<{ field: string; operator: string; value: unknown }> = [];
    if (advancedFiltersParam) {
      try {
        advancedFilters = JSON.parse(decodeURIComponent(advancedFiltersParam));
      } catch (error) {
        log.warn('Failed to parse advanced filters', { error, advancedFiltersParam });
      }
    }

    log.info('Data source query request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId,
      limit,
      startDate,
      endDate,
      practiceUid,
      advancedFiltersCount: advancedFilters.length
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
      is_active: true
    });

    if (columns.length === 0) {
      return createSuccessResponse({ data: [], total_count: 0 }, 'No active columns configured');
    }

    // Build the query
    const analyticsDb = getAnalyticsDb();
    const tableName = `${dataSource.schema_name}.${dataSource.table_name}`;

    // Build SELECT clause with all active columns
    const selectColumns = columns.map(col => col.column_name).join(', ');

    // Build WHERE clause with proper SQL parameter binding
    const whereClauses: SQL[] = [];

    if (practiceUid) {
      whereClauses.push(sql`practice_uid = ${parseInt(practiceUid, 10)}`);
    }

    if (startDate) {
      // Find the date column - look for columns that are date fields
      const dateColumn = columns.find(col => col.is_date_field);
      if (dateColumn) {
        whereClauses.push(sql.raw(`${dateColumn.column_name} >= '${startDate}'`));
      }
    }

    if (endDate) {
      const dateColumn = columns.find(col => col.is_date_field);
      if (dateColumn) {
        whereClauses.push(sql.raw(`${dateColumn.column_name} <= '${endDate}'`));
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

        // Build SQL condition based on operator
        switch (operator) {
          case 'eq':
            if (typeof value === 'string') {
              whereClauses.push(sql.raw(`${field} = '${value.replace(/'/g, "''")}'`));
            } else if (typeof value === 'number') {
              whereClauses.push(sql`${sql.raw(field)} = ${value}`);
            } else if (typeof value === 'boolean') {
              whereClauses.push(sql`${sql.raw(field)} = ${value}`);
            }
            break;

          case 'neq':
            if (typeof value === 'string') {
              whereClauses.push(sql.raw(`${field} != '${value.replace(/'/g, "''")}'`));
            } else if (typeof value === 'number') {
              whereClauses.push(sql`${sql.raw(field)} != ${value}`);
            } else if (typeof value === 'boolean') {
              whereClauses.push(sql`${sql.raw(field)} != ${value}`);
            }
            break;

          case 'gt':
            if (typeof value === 'number') {
              whereClauses.push(sql`${sql.raw(field)} > ${value}`);
            } else if (typeof value === 'string') {
              whereClauses.push(sql.raw(`${field} > '${value.replace(/'/g, "''")}'`));
            }
            break;

          case 'gte':
            if (typeof value === 'number') {
              whereClauses.push(sql`${sql.raw(field)} >= ${value}`);
            } else if (typeof value === 'string') {
              whereClauses.push(sql.raw(`${field} >= '${value.replace(/'/g, "''")}'`));
            }
            break;

          case 'lt':
            if (typeof value === 'number') {
              whereClauses.push(sql`${sql.raw(field)} < ${value}`);
            } else if (typeof value === 'string') {
              whereClauses.push(sql.raw(`${field} < '${value.replace(/'/g, "''")}'`));
            }
            break;

          case 'lte':
            if (typeof value === 'number') {
              whereClauses.push(sql`${sql.raw(field)} <= ${value}`);
            } else if (typeof value === 'string') {
              whereClauses.push(sql.raw(`${field} <= '${value.replace(/'/g, "''")}'`));
            }
            break;

          case 'like':
            if (typeof value === 'string') {
              whereClauses.push(sql.raw(`${field} LIKE '%${value.replace(/'/g, "''")}%'`));
            }
            break;

          case 'not_like':
            if (typeof value === 'string') {
              whereClauses.push(sql.raw(`${field} NOT LIKE '%${value.replace(/'/g, "''")}%'`));
            }
            break;

          case 'in':
            if (Array.isArray(value) && value.length > 0) {
              const valuesList = value
                .map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v)
                .join(', ');
              whereClauses.push(sql.raw(`${field} IN (${valuesList})`));
            }
            break;

          case 'not_in':
            if (Array.isArray(value) && value.length > 0) {
              const valuesList = value
                .map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v)
                .join(', ');
              whereClauses.push(sql.raw(`${field} NOT IN (${valuesList})`));
            }
            break;

          case 'is_null':
            whereClauses.push(sql.raw(`${field} IS NULL`));
            break;

          case 'is_not_null':
            whereClauses.push(sql.raw(`${field} IS NOT NULL`));
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
      hasFilters: whereClauses.length > 0
    });

    // Execute query
    const result = await analyticsDb.execute(query);
    const rows = result as unknown as Record<string, unknown>[];

    log.info('Data source query completed', {
      dataSourceId,
      rowCount: rows.length,
      duration: Date.now() - startTime
    });

    return createSuccessResponse({
      data: rows,
      total_count: rows.length,
      columns: columns.map(col => ({
        name: col.column_name,
        display_name: col.display_name,
        data_type: col.data_type,
        format_type: col.format_type,
        display_icon: col.display_icon,
        icon_type: col.icon_type,
        icon_color_mode: col.icon_color_mode,
        icon_color: col.icon_color,
        icon_mapping: col.icon_mapping
      }))
    }, `Retrieved ${rows.length} rows`);

  } catch (error) {
    log.error('Data source query error', error, {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(queryDataSourceHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api'
});

// Disable caching for this route - always fetch fresh data from analytics database
export const dynamic = 'force-dynamic';
export const revalidate = 0;
