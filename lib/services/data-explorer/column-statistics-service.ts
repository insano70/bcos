import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerTableMetadata, explorerColumnMetadata } from '@/lib/db/schema';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';
import { and, eq, asc, or, isNull, sql } from 'drizzle-orm';
import { log } from '@/lib/logger';

interface AnalysisOptions {
  force?: boolean; // Force re-analysis even if recently analyzed
  resume?: boolean; // Continue from last analyzed (for batch operations)
}

interface AnalysisStrategy {
  analyze: Array<'common_values' | 'example_values' | 'min_max' | 'distinct_count' | 'null_percentage'>;
  priority: 'high' | 'medium' | 'low' | 'skip';
  useSampling: boolean;
}

interface CommonValue {
  value: string;
  count: number;
  percentage: number;
}

interface ColumnAnalysisResult {
  column_metadata_id: string;
  status: 'completed' | 'failed' | 'skipped';
  duration_ms: number;
  error?: string;
}

export class ColumnStatisticsService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  /**
   * Analyze statistics for a single column
   */
  async analyzeColumn(
    columnId: string,
    options: AnalysisOptions = {}
  ): Promise<ColumnAnalysisResult> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    const startTime = Date.now();

    try {
      // Get column metadata with table info
      const [column] = await this.dbContext
        .select({
          column_metadata_id: explorerColumnMetadata.column_metadata_id,
          column_name: explorerColumnMetadata.column_name,
          data_type: explorerColumnMetadata.data_type,
          semantic_type: explorerColumnMetadata.semantic_type,
          statistics_last_analyzed: explorerColumnMetadata.statistics_last_analyzed,
          table_name: explorerTableMetadata.table_name,
          schema_name: explorerTableMetadata.schema_name,
          row_count_estimate: explorerTableMetadata.row_count_estimate,
        })
        .from(explorerColumnMetadata)
        .innerJoin(
          explorerTableMetadata,
          eq(explorerColumnMetadata.table_id, explorerTableMetadata.table_metadata_id)
        )
        .where(eq(explorerColumnMetadata.column_metadata_id, columnId))
        .limit(1);

      if (!column) {
        throw new Error(`Column metadata not found: ${columnId}`);
      }

      // Check if we should skip (recently analyzed and not forced)
      if (!options.force && column.statistics_last_analyzed) {
        const hoursSinceAnalysis =
          (Date.now() - new Date(column.statistics_last_analyzed).getTime()) / (1000 * 60 * 60);
        if (hoursSinceAnalysis < 24) {
          log.info('Skipping column - recently analyzed', {
            operation: 'analyze_column',
            columnId,
            hoursSinceAnalysis: hoursSinceAnalysis.toFixed(2),
          });
          return {
            column_metadata_id: columnId,
            status: 'skipped',
            duration_ms: Date.now() - startTime,
          };
        }
      }

      // Mark as analyzing
      await this.dbContext
        .update(explorerColumnMetadata)
        .set({
          statistics_analysis_status: 'analyzing',
          statistics_analysis_error: null,
        })
        .where(eq(explorerColumnMetadata.column_metadata_id, columnId));

      // Determine analysis strategy
      const strategy = this.getAnalysisStrategy({
        column_name: column.column_name,
        data_type: column.data_type,
        semantic_type: column.semantic_type,
      });

      if (strategy.priority === 'skip') {
        await this.dbContext
          .update(explorerColumnMetadata)
          .set({
            statistics_analysis_status: 'skipped',
            statistics_last_analyzed: new Date(),
          })
          .where(eq(explorerColumnMetadata.column_metadata_id, columnId));

        return {
          column_metadata_id: columnId,
          status: 'skipped',
          duration_ms: Date.now() - startTime,
        };
      }

      // Perform analysis based on strategy
      const samplePercent = strategy.useSampling
        ? this.determineSamplePercent(column.row_count_estimate)
        : 100;

      const updates: Record<string, unknown> = {};

      // Analyze common values
      if (strategy.analyze.includes('common_values')) {
        const commonValues = await this.analyzeCommonValues(
          column.schema_name,
          column.table_name,
          column.column_name,
          samplePercent
        );
        updates.common_values = commonValues;
      }

      // Analyze example values
      if (strategy.analyze.includes('example_values')) {
        const exampleValues = await this.analyzeExampleValues(
          column.schema_name,
          column.table_name,
          column.column_name,
          samplePercent
        );
        updates.example_values = exampleValues;
      }

      // Analyze min/max
      if (strategy.analyze.includes('min_max')) {
        const { min, max } = await this.analyzeMinMax(
          column.schema_name,
          column.table_name,
          column.column_name,
          column.data_type,
          samplePercent
        );
        updates.min_value = min;
        updates.max_value = max;
      }

      // Analyze distinct count
      if (strategy.analyze.includes('distinct_count')) {
        const distinctCount = await this.analyzeDistinctCount(
          column.schema_name,
          column.table_name,
          column.column_name,
          samplePercent
        );
        updates.distinct_count = distinctCount;
      }

      // Analyze null percentage
      if (strategy.analyze.includes('null_percentage')) {
        const nullPercentage = await this.analyzeNullPercentage(
          column.schema_name,
          column.table_name,
          column.column_name
        );
        updates.null_percentage = nullPercentage.toFixed(2);
      }

      const duration = Date.now() - startTime;

      // Update column with results
      await this.dbContext
        .update(explorerColumnMetadata)
        .set({
          ...updates,
          statistics_analysis_status: 'completed',
          statistics_last_analyzed: new Date(),
          statistics_analysis_duration_ms: duration,
          updated_at: new Date(),
        })
        .where(eq(explorerColumnMetadata.column_metadata_id, columnId));

      log.info('Column statistics analysis completed', {
        operation: 'analyze_column',
        columnId,
        columnName: column.column_name,
        tableName: column.table_name,
        duration,
        strategy: strategy.priority,
        samplePercent,
      });

      return {
        column_metadata_id: columnId,
        status: 'completed',
        duration_ms: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Mark as failed
      await this.dbContext
        .update(explorerColumnMetadata)
        .set({
          statistics_analysis_status: 'failed',
          statistics_analysis_error: errorMessage,
          statistics_analysis_duration_ms: duration,
        })
        .where(eq(explorerColumnMetadata.column_metadata_id, columnId));

      log.error('Column statistics analysis failed', error as Error, {
        operation: 'analyze_column',
        columnId,
        duration,
      });

      return {
        column_metadata_id: columnId,
        status: 'failed',
        duration_ms: duration,
        error: errorMessage,
      };
    }
  }

  /**
   * Analyze statistics for all columns in a table (resumable)
   */
  async analyzeTableColumns(
    tableId: string,
    options: AnalysisOptions = {}
  ): Promise<{ analyzed: number; skipped: number; failed: number; duration_ms: number }> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    const startTime = Date.now();

    // Get table info
    const [table] = await this.dbContext
      .select()
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.table_metadata_id, tableId))
      .limit(1);

    if (!table) {
      throw new Error(`Table metadata not found: ${tableId}`);
    }

    log.info('Starting table column statistics analysis', {
      operation: 'analyze_table_columns',
      tableId,
      tableName: table.table_name,
      resume: options.resume,
    });

    // Get columns to analyze (ordered by last analyzed for resumability)
    const columns = await this.getColumnsToAnalyze(tableId, options);

    let analyzed = 0;
    let skipped = 0;
    let failed = 0;

    for (const column of columns) {
      const result = await this.analyzeColumn(column.column_metadata_id, options);
      
      if (result.status === 'completed') analyzed++;
      else if (result.status === 'skipped') skipped++;
      else if (result.status === 'failed') failed++;
    }

    const duration = Date.now() - startTime;

    log.info('Table column statistics analysis completed', {
      operation: 'analyze_table_columns',
      tableId,
      tableName: table.table_name,
      analyzed,
      skipped,
      failed,
      duration,
    });

    return { analyzed, skipped, failed, duration_ms: duration };
  }

  /**
   * Analyze statistics for columns across the entire schema (resumable)
   */
  async analyzeSchemaColumns(
    schemaName: string = 'ih',
    options: AnalysisOptions & { tiers?: Array<1 | 2 | 3>; limit?: number } = {}
  ): Promise<{ analyzed: number; skipped: number; failed: number; duration_ms: number }> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    const startTime = Date.now();

    log.info('Starting schema-wide column statistics analysis', {
      operation: 'analyze_schema_columns',
      schemaName,
      tiers: options.tiers,
      limit: options.limit,
      resume: options.resume,
    });

    // Build query for tables
    const tierFilter = options.tiers
      ? sql`${explorerTableMetadata.tier} IN (${sql.join(options.tiers.map((t) => sql`${t}`), sql`, `)})`
      : sql`true`;

    // Get tables in specified tiers
    const tables = await this.dbContext
      .select({
        table_metadata_id: explorerTableMetadata.table_metadata_id,
        table_name: explorerTableMetadata.table_name,
        tier: explorerTableMetadata.tier,
      })
      .from(explorerTableMetadata)
      .where(
        and(
          eq(explorerTableMetadata.schema_name, schemaName),
          eq(explorerTableMetadata.is_active, true),
          tierFilter
        )
      )
      .orderBy(asc(explorerTableMetadata.tier));

    let analyzed = 0;
    let skipped = 0;
    let failed = 0;
    let totalColumnsProcessed = 0;

    for (const table of tables) {
      // Check if we've hit the limit
      if (options.limit && totalColumnsProcessed >= options.limit) {
        log.info('Reached analysis limit', {
          operation: 'analyze_schema_columns',
          limit: options.limit,
          totalColumnsProcessed,
        });
        break;
      }

      const result = await this.analyzeTableColumns(table.table_metadata_id, options);
      
      analyzed += result.analyzed;
      skipped += result.skipped;
      failed += result.failed;
      totalColumnsProcessed += result.analyzed + result.skipped + result.failed;
    }

    const duration = Date.now() - startTime;

    log.info('Schema-wide column statistics analysis completed', {
      operation: 'analyze_schema_columns',
      schemaName,
      tablesProcessed: tables.length,
      analyzed,
      skipped,
      failed,
      duration,
    });

    return { analyzed, skipped, failed, duration_ms: duration };
  }

  /**
   * Get columns to analyze, ordered for resumability
   */
  private async getColumnsToAnalyze(
    tableId: string,
    options: AnalysisOptions
  ): Promise<Array<{ column_metadata_id: string }>> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    // If resuming, order by last analyzed (nulls first)
    // If forcing, get all columns
    const whereConditions = options.resume && !options.force
      ? or(
          isNull(explorerColumnMetadata.statistics_last_analyzed),
          sql`${explorerColumnMetadata.statistics_last_analyzed} < NOW() - INTERVAL '24 hours'`
        )
      : undefined;

    return await this.dbContext
      .select({
        column_metadata_id: explorerColumnMetadata.column_metadata_id,
      })
      .from(explorerColumnMetadata)
      .where(
        whereConditions
          ? and(eq(explorerColumnMetadata.table_id, tableId), whereConditions)
          : eq(explorerColumnMetadata.table_id, tableId)
      )
      .orderBy(asc(explorerColumnMetadata.statistics_last_analyzed));
  }

  /**
   * Determine analysis strategy based on column characteristics
   */
  private getAnalysisStrategy(column: {
    column_name: string;
    data_type: string;
    semantic_type: string | null;
  }): AnalysisStrategy {
    const columnNameLower = column.column_name.toLowerCase();

    // Status columns - FULL STATISTICS (high value for filtering)
    if (columnNameLower.includes('status') || column.semantic_type === 'status') {
      return {
        analyze: ['common_values', 'example_values', 'distinct_count', 'null_percentage'],
        priority: 'high',
        useSampling: false,
      };
    }

    // Code columns - FULL STATISTICS (enumerations)
    if (column.semantic_type === 'code' || columnNameLower.includes('code')) {
      return {
        analyze: ['common_values', 'example_values', 'distinct_count', 'null_percentage'],
        priority: 'high',
        useSampling: false,
      };
    }

    // Date columns - MIN/MAX and NULL%
    if (column.semantic_type === 'date') {
      return {
        analyze: ['min_max', 'null_percentage', 'example_values'],
        priority: 'medium',
        useSampling: true,
      };
    }

    // Amount/numeric columns - MIN/MAX, DISTINCT, NULL%
    if (column.semantic_type === 'amount' || column.data_type.includes('numeric') || column.data_type.includes('int')) {
      return {
        analyze: ['min_max', 'distinct_count', 'null_percentage', 'example_values'],
        priority: 'medium',
        useSampling: true,
      };
    }

    // Boolean columns - COMMON VALUES
    if (column.semantic_type === 'boolean') {
      return {
        analyze: ['common_values', 'null_percentage'],
        priority: 'low',
        useSampling: false,
      };
    }

    // Identifier columns - SKIP (not useful for AI context)
    if (column.semantic_type === 'identifier' || columnNameLower.endsWith('_id') || columnNameLower.endsWith('_uid')) {
      return {
        analyze: [],
        priority: 'skip',
        useSampling: false,
      };
    }

    // Text columns - EXAMPLE VALUES only (sampling)
    if (column.semantic_type === 'text' || column.data_type.includes('text') || column.data_type.includes('varchar')) {
      return {
        analyze: ['example_values', 'null_percentage'],
        priority: 'low',
        useSampling: true,
      };
    }

    // Default: basic analysis
    return {
      analyze: ['example_values', 'null_percentage'],
      priority: 'low',
      useSampling: true,
    };
  }

  /**
   * Determine sampling percentage based on row count
   */
  private determineSamplePercent(rowCount: number | null): number {
    if (!rowCount) return 10; // Default to 10% if unknown

    if (rowCount < 10000) return 100; // Full scan for small tables
    if (rowCount < 100000) return 50;
    if (rowCount < 1000000) return 20;
    if (rowCount < 10000000) return 10;
    return 5; // 5% for very large tables
  }

  /**
   * Analyze common values for a column
   */
  private async analyzeCommonValues(
    schemaName: string,
    tableName: string,
    columnName: string,
    samplePercent: number
  ): Promise<CommonValue[]> {
    const sampleClause = samplePercent < 100 ? `TABLESAMPLE BERNOULLI (${samplePercent})` : '';

    const query = `
      WITH value_counts AS (
        SELECT 
          ${columnName}::text as value,
          COUNT(*) as count
        FROM ${schemaName}.${tableName} ${sampleClause}
        WHERE ${columnName} IS NOT NULL
        GROUP BY ${columnName}::text
        ORDER BY count DESC
        LIMIT 10
      ),
      total AS (
        SELECT COUNT(*) as total_count
        FROM ${schemaName}.${tableName} ${sampleClause}
        WHERE ${columnName} IS NOT NULL
      )
      SELECT 
        value,
        count::integer,
        ROUND((count::numeric / total.total_count::numeric * 100), 2)::numeric as percentage
      FROM value_counts, total
      ORDER BY count DESC
    `;

    const results = await executeAnalyticsQuery<{ value: string; count: number; percentage: number }>(query);
    return results;
  }

  /**
   * Analyze example values for a column
   */
  private async analyzeExampleValues(
    schemaName: string,
    tableName: string,
    columnName: string,
    samplePercent: number
  ): Promise<string[]> {
    const sampleClause = samplePercent < 100 ? `TABLESAMPLE BERNOULLI (${samplePercent})` : '';

    const query = `
      SELECT DISTINCT ${columnName}::text as value
      FROM ${schemaName}.${tableName} ${sampleClause}
      WHERE ${columnName} IS NOT NULL
      LIMIT 5
    `;

    const results = await executeAnalyticsQuery<{ value: string }>(query);
    return results.map((r) => r.value);
  }

  /**
   * Analyze min/max values for a column
   */
  private async analyzeMinMax(
    schemaName: string,
    tableName: string,
    columnName: string,
    dataType: string,
    samplePercent: number
  ): Promise<{ min: string | null; max: string | null }> {
    const sampleClause = samplePercent < 100 ? `TABLESAMPLE BERNOULLI (${samplePercent})` : '';

    // Only analyze min/max for orderable types
    if (!this.isOrderableType(dataType)) {
      return { min: null, max: null };
    }

    const query = `
      SELECT 
        MIN(${columnName})::text as min_value,
        MAX(${columnName})::text as max_value
      FROM ${schemaName}.${tableName} ${sampleClause}
      WHERE ${columnName} IS NOT NULL
    `;

    const results = await executeAnalyticsQuery<{ min_value: string | null; max_value: string | null }>(query);
    return {
      min: results[0]?.min_value ?? null,
      max: results[0]?.max_value ?? null,
    };
  }

  /**
   * Analyze distinct count for a column
   */
  private async analyzeDistinctCount(
    schemaName: string,
    tableName: string,
    columnName: string,
    samplePercent: number
  ): Promise<number> {
    const sampleClause = samplePercent < 100 ? `TABLESAMPLE BERNOULLI (${samplePercent})` : '';

    const query = `
      SELECT COUNT(DISTINCT ${columnName})::integer as distinct_count
      FROM ${schemaName}.${tableName} ${sampleClause}
      WHERE ${columnName} IS NOT NULL
    `;

    const results = await executeAnalyticsQuery<{ distinct_count: number }>(query);
    return results[0]?.distinct_count ?? 0;
  }

  /**
   * Analyze null percentage for a column
   */
  private async analyzeNullPercentage(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<number> {
    const query = `
      SELECT 
        ROUND(
          (COUNT(*) FILTER (WHERE ${columnName} IS NULL)::numeric / COUNT(*)::numeric * 100),
          2
        )::numeric as null_percentage
      FROM ${schemaName}.${tableName}
    `;

    const results = await executeAnalyticsQuery<{ null_percentage: string | number }>(query);
    const value = results[0]?.null_percentage;
    // PostgreSQL numeric type returns as string, convert to number
    return value ? Number(value) : 0;
  }

  /**
   * Check if data type supports ordering (for min/max)
   */
  private isOrderableType(dataType: string): boolean {
    const orderableTypes = [
      'integer',
      'bigint',
      'smallint',
      'numeric',
      'decimal',
      'real',
      'double precision',
      'date',
      'timestamp',
      'timestamptz',
      'time',
    ];
    return orderableTypes.some((type) => dataType.toLowerCase().includes(type));
  }
}

