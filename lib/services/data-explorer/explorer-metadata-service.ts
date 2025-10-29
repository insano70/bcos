import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerColumnMetadata, explorerTableMetadata } from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import type { ColumnMetadata, MetadataQueryOptions, TableMetadata } from '@/lib/types/data-explorer';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

export interface MetadataServiceInterface {
  getTableMetadata(options?: MetadataQueryOptions): Promise<TableMetadata[]>;
  getTableById(tableId: string): Promise<TableMetadata | null>;
  getColumnMetadata(tableId: string): Promise<ColumnMetadata[]>;
  updateTableMetadata(tableId: string, data: Partial<TableMetadata>): Promise<TableMetadata>;
  calculateCompleteness(metadata: TableMetadata): number;
  getTableMetadataCount(options?: MetadataQueryOptions): Promise<number>;
}

export class ExplorerMetadataService extends BaseRBACService implements MetadataServiceInterface {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  async getTableMetadata(options: MetadataQueryOptions = {}): Promise<TableMetadata[]> {
    const startTime = Date.now();

    this.requireAnyPermission([
      'data-explorer:metadata:read:organization',
      'data-explorer:metadata:read:all',
    ]);

    const conditions: SQL[] = [];

    if (options.schema_name) {
      conditions.push(eq(explorerTableMetadata.schema_name, options.schema_name));
    }
    if (options.tier !== undefined) {
      conditions.push(eq(explorerTableMetadata.tier, options.tier));
    }
    if (options.is_active !== undefined) {
      conditions.push(eq(explorerTableMetadata.is_active, options.is_active));
    }
    if (options.search) {
      conditions.push(
        sql`(
          ${explorerTableMetadata.table_name} ILIKE ${`%${options.search}%`}
          OR ${explorerTableMetadata.display_name} ILIKE ${`%${options.search}%`}
          OR ${explorerTableMetadata.description} ILIKE ${`%${options.search}%`}
        )`
      );
    }

    if (!this.dbContext) throw new Error('Database context not initialized');
    const metadata = await this.dbContext
      .select()
      .from(explorerTableMetadata)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(explorerTableMetadata.tier), explorerTableMetadata.table_name)
      .limit(options.limit ?? 1000)
      .offset(options.offset ?? 0);

    const duration = Date.now() - startTime;

    log.info('Table metadata query completed', {
      operation: 'explorer_list_metadata',
      resourceType: 'explorer_metadata',
      userId: this.userContext.user_id,
      results: { returned: metadata.length },
      duration,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY,
      component: 'business-logic',
    });

    return metadata as TableMetadata[];
  }

  async getTableById(tableId: string): Promise<TableMetadata | null> {
    this.requireAnyPermission([
      'data-explorer:metadata:read:organization',
      'data-explorer:metadata:read:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');
    const [metadata] = await this.dbContext
      .select()
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.table_metadata_id, tableId))
      .limit(1);

    return (metadata as TableMetadata) || null;
  }

  async getColumnMetadata(tableId: string): Promise<ColumnMetadata[]> {
    this.requireAnyPermission([
      'data-explorer:metadata:read:organization',
      'data-explorer:metadata:read:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');
    const columns = await this.dbContext
      .select()
      .from(explorerColumnMetadata)
      .where(eq(explorerColumnMetadata.table_id, tableId))
      .orderBy(explorerColumnMetadata.column_name);

    return columns as ColumnMetadata[];
  }

  async updateTableMetadata(
    tableId: string,
    data: Partial<TableMetadata>
  ): Promise<TableMetadata> {
    const startTime = Date.now();

    this.requirePermission('data-explorer:metadata:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');
    const [updated] = await this.dbContext
      .update(explorerTableMetadata)
      .set({
        // Only include fields explicitly provided to satisfy Drizzle type narrowing
        ...(data.display_name !== undefined && { display_name: data.display_name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.row_meaning !== undefined && { row_meaning: data.row_meaning }),
        ...(data.primary_entity !== undefined && { primary_entity: data.primary_entity }),
        ...(data.common_filters !== undefined && { common_filters: data.common_filters }),
        ...(data.common_joins !== undefined && { common_joins: data.common_joins }),
        ...(data.tier !== undefined && { tier: data.tier }),
        ...(data.sample_questions !== undefined && { sample_questions: data.sample_questions }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
        ...(data.is_auto_discovered !== undefined && { is_auto_discovered: data.is_auto_discovered }),
        ...(data.confidence_score !== undefined && {
          confidence_score:
            data.confidence_score === null
              ? null
              : String(data.confidence_score),
        }),
        ...(data.row_count_estimate !== undefined && {
          row_count_estimate: data.row_count_estimate ?? null,
        }),
        ...(data.last_analyzed !== undefined && { last_analyzed: data.last_analyzed }),
        ...(data.created_by !== undefined && { created_by: data.created_by }),
        ...(data.updated_by !== undefined && { updated_by: data.updated_by }),
        updated_at: new Date(),
        updated_by: this.userContext.user_id,
      })
      .where(eq(explorerTableMetadata.table_metadata_id, tableId))
      .returning();

    if (!updated) {
      throw new Error('Table metadata not found');
    }

    const duration = Date.now() - startTime;

    log.info('Table metadata updated', {
      operation: 'explorer_update_metadata',
      resourceType: 'explorer_metadata',
      resourceId: tableId,
      userId: this.userContext.user_id,
      duration,
      component: 'business-logic',
    });

    return updated as TableMetadata;
  }

  async getTableMetadataCount(options: MetadataQueryOptions = {}): Promise<number> {
    this.requireAnyPermission([
      'data-explorer:metadata:read:organization',
      'data-explorer:metadata:read:all',
    ]);

    const conditions: SQL[] = [];

    if (options.schema_name) {
      conditions.push(eq(explorerTableMetadata.schema_name, options.schema_name));
    }
    if (options.tier !== undefined) {
      conditions.push(eq(explorerTableMetadata.tier, options.tier));
    }
    if (options.is_active !== undefined) {
      conditions.push(eq(explorerTableMetadata.is_active, options.is_active));
    }

    if (!this.dbContext) throw new Error('Database context not initialized');
    const [result] = await this.dbContext
      .select({ count: sql<number>`count(*)` })
      .from(explorerTableMetadata)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return result?.count || 0;
  }

  calculateCompleteness(metadata: TableMetadata): number {
    const fields = [
      metadata.display_name,
      metadata.description,
      metadata.row_meaning,
      metadata.primary_entity,
      metadata.common_filters?.length,
      metadata.sample_questions?.length,
    ];

    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }

  async createTableMetadata(data: {
    schema_name: string;
    table_name: string;
    display_name?: string;
    description?: string;
    tier?: 1 | 2 | 3;
  }): Promise<TableMetadata> {
    this.requirePermission('data-explorer:metadata:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');
    const [created] = await this.dbContext
      .insert(explorerTableMetadata)
      .values({
        schema_name: data.schema_name,
        table_name: data.table_name,
        display_name: data.display_name,
        description: data.description,
        tier: data.tier || 3,
        is_active: true,
        created_by: this.userContext.user_id,
      })
      .returning();

    if (!created) throw new Error('Failed to create table metadata');
    return created as TableMetadata;
  }

  async deleteTableMetadata(tableId: string): Promise<void> {
    this.requirePermission('data-explorer:metadata:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');
    await this.dbContext
      .delete(explorerTableMetadata)
      .where(eq(explorerTableMetadata.table_metadata_id, tableId));
  }

  async updateColumnMetadata(columnId: string, data: Partial<ColumnMetadata>): Promise<ColumnMetadata> {
    this.requirePermission('data-explorer:metadata:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');
    const [updated] = await this.dbContext
      .update(explorerColumnMetadata)
      .set({
        ...(data.display_name !== undefined && { display_name: data.display_name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.semantic_type !== undefined && { semantic_type: data.semantic_type }),
        ...(data.is_phi !== undefined && { is_phi: data.is_phi }),
        updated_at: new Date(),
      })
      .where(eq(explorerColumnMetadata.column_metadata_id, columnId))
      .returning();

    if (!updated) throw new Error('Column metadata not found');
    return updated as ColumnMetadata;
  }
}
