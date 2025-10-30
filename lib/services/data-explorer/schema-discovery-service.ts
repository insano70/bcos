import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerTableMetadata, explorerColumnMetadata } from '@/lib/db/schema';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';
import { and, eq } from 'drizzle-orm';
import { log } from '@/lib/logger';

interface DiscoveryResult {
  tables_discovered: number;
  tables_new: number;
  tables_updated: number;
  columns_analyzed: number;
}

interface TableSchemaInfo {
  table_name: string;
  column_count: number;
}

interface ColumnSchemaInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export class SchemaDiscoveryService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  async discoverTables(schemaName: string = 'ih', limit: number = 1000): Promise<DiscoveryResult> {
    const startTime = Date.now();

    this.requirePermission('data-explorer:manage:all');

    log.info('Starting schema discovery', {
      operation: 'discover_schema',
      schemaName,
      limit,
      userId: this.userContext.user_id,
      component: 'business-logic',
    });

    // Query information_schema for tables
    const tables = await executeAnalyticsQuery<TableSchemaInfo>(`
      SELECT 
        t.table_name,
        COUNT(c.column_name)::integer as column_count
      FROM information_schema.tables t
      LEFT JOIN information_schema.columns c 
        ON t.table_schema = c.table_schema 
        AND t.table_name = c.table_name
      WHERE t.table_schema = '${schemaName}'
        AND t.table_type = 'BASE TABLE'
      GROUP BY t.table_name
      ORDER BY t.table_name
      LIMIT ${limit}
    `);

    let tablesNew = 0;
    let tablesUpdated = 0;
    let columnsAnalyzed = 0;

    if (!this.dbContext) throw new Error('Database context not initialized');

    for (const table of tables) {
      // Check if table metadata already exists
      const [existing] = await this.dbContext
        .select()
        .from(explorerTableMetadata)
        .where(
          and(
            eq(explorerTableMetadata.schema_name, schemaName),
            eq(explorerTableMetadata.table_name, table.table_name)
          )
        )
        .limit(1);

      if (existing) {
        // Update column count estimate and discover/update columns
        await this.dbContext
          .update(explorerTableMetadata)
          .set({
            last_analyzed: new Date(),
            updated_at: new Date(),
          })
          .where(eq(explorerTableMetadata.table_metadata_id, existing.table_metadata_id));
        
        // Discover columns for existing table
        const newColumns = await this.discoverColumnsForTable(
          existing.table_metadata_id,
          schemaName,
          table.table_name
        );
        columnsAnalyzed += newColumns;
        tablesUpdated++;
      } else {
        // Determine tier based on table name heuristics
        const tier = this.inferTier(table.table_name);
        const commonFilters = await this.detectCommonFilters(schemaName, table.table_name);

        // Create new table metadata
        const [newTable] = await this.dbContext.insert(explorerTableMetadata).values({
          schema_name: schemaName,
          table_name: table.table_name,
          display_name: this.formatDisplayName(table.table_name),
          description: `Auto-discovered table: ${table.table_name} (${table.column_count} columns)`,
          tier: tier,
          common_filters: commonFilters.length > 0 ? commonFilters : null,
          is_active: true,
          is_auto_discovered: true,
          confidence_score: '0.60',
          last_analyzed: new Date(),
          created_by: this.userContext.user_id,
        }).returning();

        // Discover columns for new table
        if (newTable) {
          const newColumns = await this.discoverColumnsForTable(
            newTable.table_metadata_id,
            schemaName,
            table.table_name
          );
          columnsAnalyzed += newColumns;
        }

        tablesNew++;
      }
    }

    const duration = Date.now() - startTime;

    log.info('Schema discovery completed', {
      operation: 'discover_schema',
      schemaName,
      duration,
      tablesDiscovered: tables.length,
      tablesNew,
      tablesUpdated,
      columnsAnalyzed,
      userId: this.userContext.user_id,
      component: 'business-logic',
    });

    return {
      tables_discovered: tables.length,
      tables_new: tablesNew,
      tables_updated: tablesUpdated,
      columns_analyzed: columnsAnalyzed,
    };
  }

  async discoverColumns(tableId: string): Promise<number> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');

    // Get table info
    const [tableMetadata] = await this.dbContext
      .select()
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.table_metadata_id, tableId))
      .limit(1);

    if (!tableMetadata) throw new Error('Table metadata not found');

    return await this.discoverColumnsForTable(
      tableId,
      tableMetadata.schema_name,
      tableMetadata.table_name
    );
  }

  private async discoverColumnsForTable(
    tableId: string,
    schemaName: string,
    tableName: string
  ): Promise<number> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    // Query columns from information_schema
    const columns = await executeAnalyticsQuery<ColumnSchemaInfo>(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = '${schemaName}'
        AND table_name = '${tableName}'
      ORDER BY ordinal_position
    `);

    let columnsCreated = 0;

    for (const col of columns) {
      // Check if column already exists
      const [existing] = await this.dbContext
        .select()
        .from(explorerColumnMetadata)
        .where(
          and(
            eq(explorerColumnMetadata.table_id, tableId),
            eq(explorerColumnMetadata.column_name, col.column_name)
          )
        )
        .limit(1);

      if (!existing) {
        await this.dbContext.insert(explorerColumnMetadata).values({
          table_id: tableId,
          column_name: col.column_name,
          data_type: col.data_type,
          is_nullable: col.is_nullable === 'YES',
          semantic_type: this.inferSemanticType(col.column_name, col.data_type),
        });
        columnsCreated++;
      }
    }

    return columnsCreated;
  }

  private inferTier(tableName: string): 1 | 2 | 3 {
    const lower = tableName.toLowerCase();
    
    // Tier 1: Aggregated measures and core entities
    if (lower.includes('agg_') || lower.includes('_measures') || lower === 'attribute_patients') {
      return 1;
    }
    
    // Tier 2: Secondary/supporting tables
    if (lower.includes('attribute_') || lower.includes('bendfusion_') || lower.includes('dim_')) {
      return 2;
    }
    
    // Tier 3: All others
    return 3;
  }

  private formatDisplayName(tableName: string): string {
    return tableName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async detectCommonFilters(schemaName: string, tableName: string): Promise<string[]> {
    try {
      const columns = await executeAnalyticsQuery<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = '${tableName}'
          AND column_name IN ('practice_uid', 'provider_uid', 'date_index', 'created_at', 'measure', 'frequency', 'time_period')
      `);

      return columns.map((c) => c.column_name);
    } catch (error) {
      log.error('Failed to detect common filters', error as Error, {
        operation: 'detect_common_filters',
        tableName,
      });
      return [];
    }
  }

  private inferSemanticType(
    columnName: string,
    dataType: string
  ): 'date' | 'amount' | 'identifier' | 'code' | 'text' | 'boolean' | 'status' | null {
    const lower = columnName.toLowerCase();

    // Status columns (high priority for statistics)
    if (lower.includes('status')) {
      return 'status';
    }
    if (lower.includes('date') || lower.includes('_dt') || lower.includes('_at')) {
      return 'date';
    }
    if (lower.includes('amount') || lower.includes('_amt') || lower.includes('revenue') || lower.includes('payment')) {
      return 'amount';
    }
    if (lower.includes('_id') || lower.includes('_uid') || lower === 'id') {
      return 'identifier';
    }
    if (lower.includes('code') || lower.includes('_cd')) {
      return 'code';
    }
    if (dataType === 'boolean' || dataType === 'bool') {
      return 'boolean';
    }
    if (dataType.includes('text') || dataType.includes('varchar') || dataType.includes('char')) {
      return 'text';
    }

    return null;
  }
}

