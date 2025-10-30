import { and, eq, sql, type SQL, or, desc, asc } from 'drizzle-orm';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerColumnMetadata, explorerTableMetadata, explorerTableRelationships, explorerSchemaInstructions } from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import type { ColumnMetadata, MetadataQueryOptions, TableMetadata, SchemaInstruction, CreateSchemaInstructionData } from '@/lib/types/data-explorer';
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
      'data-explorer:read:organization',
      'data-explorer:read:all',
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
      .orderBy(explorerTableMetadata.tier, explorerTableMetadata.table_name)
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
      'data-explorer:read:organization',
      'data-explorer:read:all',
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
      'data-explorer:read:organization',
      'data-explorer:read:all',
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

    this.requirePermission('data-explorer:manage:all');

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
      'data-explorer:read:organization',
      'data-explorer:read:all',
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

  async calculateQualityScore(tableId: string): Promise<number> {
    if (!this.dbContext) throw new Error('Database context not initialized');

    const [metadata] = await this.dbContext
      .select()
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.table_metadata_id, tableId))
      .limit(1);

    if (!metadata) return 0;

    let score = 0;
    const maxScore = 100;

    // Description quality (30 points)
    if (metadata.description) {
      const descLength = metadata.description.length;
      if (descLength > 200) score += 30;
      else if (descLength > 100) score += 20;
      else if (descLength > 50) score += 10;
      else score += 5;
    }

    // Sample questions (20 points)
    const questionCount = metadata.sample_questions?.length || 0;
    if (questionCount >= 3) score += 20;
    else if (questionCount === 2) score += 13;
    else if (questionCount === 1) score += 7;

    // Row meaning (10 points)
    if (metadata.row_meaning && metadata.row_meaning.length > 20) score += 10;
    else if (metadata.row_meaning) score += 5;

    // Common filters (10 points)
    const filterCount = metadata.common_filters?.length || 0;
    if (filterCount >= 3) score += 10;
    else if (filterCount >= 2) score += 7;
    else if (filterCount >= 1) score += 4;

    // Column descriptions (20 points)
    const columns = await this.dbContext
      .select()
      .from(explorerColumnMetadata)
      .where(eq(explorerColumnMetadata.table_id, tableId));

    const columnsWithDesc = columns.filter(c => c.description && c.description.length > 10);
    const columnCoverage = columns.length > 0 ? columnsWithDesc.length / columns.length : 0;
    score += Math.round(columnCoverage * 20);

    // Relationships (10 points)
    const relationships = await this.dbContext
      .select()
      .from(explorerTableRelationships)
      .where(
        or(
          eq(explorerTableRelationships.from_table_id, tableId),
          eq(explorerTableRelationships.to_table_id, tableId)
        )
      );

    const relCount = relationships.length;
    if (relCount >= 3) score += 10;
    else if (relCount >= 2) score += 7;
    else if (relCount >= 1) score += 4;

    return Math.min(score, maxScore);
  }

  async createTableMetadata(data: {
    schema_name: string;
    table_name: string;
    display_name?: string;
    description?: string;
    tier?: 1 | 2 | 3;
  }): Promise<TableMetadata> {
    this.requirePermission('data-explorer:manage:all');

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
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');
    await this.dbContext
      .delete(explorerTableMetadata)
      .where(eq(explorerTableMetadata.table_metadata_id, tableId));
  }

  async updateColumnMetadata(columnId: string, data: Partial<ColumnMetadata>): Promise<ColumnMetadata> {
    this.requirePermission('data-explorer:manage:all');

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

  async getSchemaInstructions(schemaName: string = 'ih'): Promise<SchemaInstruction[]> {
    this.requireAnyPermission([
      'data-explorer:read:organization',
      'data-explorer:read:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');
    
    const instructions = await this.dbContext
      .select()
      .from(explorerSchemaInstructions)
      .where(
        and(
          eq(explorerSchemaInstructions.schema_name, schemaName),
          eq(explorerSchemaInstructions.is_active, true)
        )
      )
      .orderBy(asc(explorerSchemaInstructions.priority), desc(explorerSchemaInstructions.created_at));

    return instructions as SchemaInstruction[];
  }

  async createSchemaInstruction(data: CreateSchemaInstructionData): Promise<SchemaInstruction> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');
    
    const [created] = await this.dbContext
      .insert(explorerSchemaInstructions)
      .values({
        schema_name: data.schema_name || 'ih',
        category: data.category,
        title: data.title,
        instruction: data.instruction,
        priority: data.priority || 2,
        applies_to_tables: data.applies_to_tables,
        example_query: data.example_query,
        example_sql: data.example_sql,
        created_by: this.userContext.user_id,
      })
      .returning();

    if (!created) throw new Error('Failed to create schema instruction');
    return created as SchemaInstruction;
  }

  async updateSchemaInstruction(id: string, data: Partial<SchemaInstruction>): Promise<SchemaInstruction> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');
    
    const [updated] = await this.dbContext
      .update(explorerSchemaInstructions)
      .set({
        ...(data.title !== undefined && { title: data.title }),
        ...(data.instruction !== undefined && { instruction: data.instruction }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.applies_to_tables !== undefined && { applies_to_tables: data.applies_to_tables }),
        ...(data.example_query !== undefined && { example_query: data.example_query }),
        ...(data.example_sql !== undefined && { example_sql: data.example_sql }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
        updated_at: new Date(),
        updated_by: this.userContext.user_id,
      })
      .where(eq(explorerSchemaInstructions.instruction_id, id))
      .returning();

    if (!updated) throw new Error('Schema instruction not found');
    return updated as SchemaInstruction;
  }

  async deleteSchemaInstruction(id: string): Promise<void> {
    this.requirePermission('data-explorer:manage:all');

    if (!this.dbContext) throw new Error('Database context not initialized');
    
    await this.dbContext
      .delete(explorerSchemaInstructions)
      .where(eq(explorerSchemaInstructions.instruction_id, id));
  }
}
