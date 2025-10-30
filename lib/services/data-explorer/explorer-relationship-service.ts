import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerTableMetadata, explorerColumnMetadata, explorerTableRelationships } from '@/lib/db/schema';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';
import { and, eq, or } from 'drizzle-orm';
import { log } from '@/lib/logger';

interface DetectedRelationship {
  from_table_id: string;
  from_table_name: string;
  from_column: string;
  to_table_id: string;
  to_table_name: string;
  to_column: string;
  relationship_type: 'one-to-many' | 'many-to-one' | 'many-to-many' | 'one-to-one';
  confidence: number;
  join_condition: string;
}

interface TableRelationship {
  table_relationship_id: string;
  from_table_id: string;
  to_table_id: string;
  relationship_type: string;
  join_condition: string;
  is_common: boolean;
  confidence_score: string | null;
  discovered_from: string | null;
  created_at: Date;
}

export class ExplorerRelationshipService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  async detectRelationships(schemaName: string = 'ih'): Promise<DetectedRelationship[]> {
    const startTime = Date.now();

    this.requirePermission('data-explorer:manage:all');

    log.info('Starting relationship detection', {
      operation: 'detect_relationships',
      schemaName,
      userId: this.userContext.user_id,
      component: 'business-logic',
    });

    if (!this.dbContext) throw new Error('Database context not initialized');

    // Get all tables for this schema
    const tables = await this.dbContext
      .select()
      .from(explorerTableMetadata)
      .where(eq(explorerTableMetadata.schema_name, schemaName));

    const relationships: DetectedRelationship[] = [];

    for (const fromTable of tables) {
      // Get columns for this table
      const columns = await this.dbContext
        .select()
        .from(explorerColumnMetadata)
        .where(eq(explorerColumnMetadata.table_id, fromTable.table_metadata_id));

      for (const column of columns) {
        // Detect potential FK relationships
        const potentialRelationships = await this.detectForeignKeyForColumn(
          fromTable,
          column,
          tables
        );

        relationships.push(...potentialRelationships);
      }
    }

    // Store detected relationships
    for (const rel of relationships) {
      // Check if relationship already exists
      const [existing] = await this.dbContext
        .select()
        .from(explorerTableRelationships)
        .where(
          and(
            eq(explorerTableRelationships.from_table_id, rel.from_table_id),
            eq(explorerTableRelationships.to_table_id, rel.to_table_id),
            eq(explorerTableRelationships.join_condition, rel.join_condition)
          )
        )
        .limit(1);

      if (!existing) {
        await this.dbContext.insert(explorerTableRelationships).values({
          from_table_id: rel.from_table_id,
          to_table_id: rel.to_table_id,
          relationship_type: rel.relationship_type,
          join_condition: rel.join_condition,
          is_common: rel.confidence > 0.8,
          confidence_score: rel.confidence.toFixed(2),
          discovered_from: 'auto-detection',
        });
      }
    }

    const duration = Date.now() - startTime;

    log.info('Relationship detection completed', {
      operation: 'detect_relationships',
      relationshipsFound: relationships.length,
      duration,
      userId: this.userContext.user_id,
      component: 'business-logic',
    });

    return relationships;
  }

  async getRelationshipsForTable(tableId: string): Promise<TableRelationship[]> {
    this.requireAnyPermission([
      'data-explorer:read:organization',
      'data-explorer:read:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');

    const relationships = await this.dbContext
      .select()
      .from(explorerTableRelationships)
      .where(
        or(
          eq(explorerTableRelationships.from_table_id, tableId),
          eq(explorerTableRelationships.to_table_id, tableId)
        )
      );

    return relationships as TableRelationship[];
  }

  private async detectForeignKeyForColumn(
    fromTable: { table_metadata_id: string; table_name: string },
    column: { column_name: string; data_type: string },
    allTables: Array<{ table_metadata_id: string; table_name: string }>
  ): Promise<DetectedRelationship[]> {
    const relationships: DetectedRelationship[] = [];
    const columnName = column.column_name.toLowerCase();

    // Pattern 1: column_name ends with _id or _uid
    if (columnName.endsWith('_id') || columnName.endsWith('_uid')) {
      // Extract potential table name
      const potentialTableName = columnName
        .replace(/_id$/, '')
        .replace(/_uid$/, '');

      // Look for matching table
      for (const toTable of allTables) {
        if (toTable.table_name === fromTable.table_name) continue; // Skip self-references

        const toTableName = toTable.table_name.toLowerCase();
        
        // Check if table name matches (singular/plural variations)
        if (
          toTableName === potentialTableName ||
          toTableName === `${potentialTableName}s` ||
          `${toTableName}s` === potentialTableName ||
          toTableName.includes(potentialTableName) ||
          potentialTableName.includes(toTableName)
        ) {
          // Found likely relationship
          const confidence = this.calculateConfidence(columnName, toTableName);

          relationships.push({
            from_table_id: fromTable.table_metadata_id,
            from_table_name: fromTable.table_name,
            from_column: column.column_name,
            to_table_id: toTable.table_metadata_id,
            to_table_name: toTable.table_name,
            to_column: columnName.endsWith('_uid') ? column.column_name : 'id', // Assume 'id' or matching column
            relationship_type: 'many-to-one',
            confidence,
            join_condition: `${fromTable.table_name}.${column.column_name} = ${toTable.table_name}.${columnName.endsWith('_uid') ? column.column_name.replace(`${fromTable.table_name}_`, '') : 'id'}`,
          });
        }
      }
    }

    // Pattern 2: Common FK patterns (patient_id, provider_id, etc.)
    const commonFKPatterns = [
      { column: 'patient_id', table: 'patients' },
      { column: 'patient_uid', table: 'patients' },
      { column: 'provider_id', table: 'providers' },
      { column: 'provider_uid', table: 'providers' },
      { column: 'practice_id', table: 'practices' },
      { column: 'practice_uid', table: 'practices' },
      { column: 'encounter_id', table: 'encounters' },
      { column: 'claim_id', table: 'claims' },
    ];

    for (const pattern of commonFKPatterns) {
      if (columnName === pattern.column) {
        const toTable = allTables.find(t => t.table_name.toLowerCase().includes(pattern.table));
        if (toTable && toTable.table_name !== fromTable.table_name) {
          relationships.push({
            from_table_id: fromTable.table_metadata_id,
            from_table_name: fromTable.table_name,
            from_column: column.column_name,
            to_table_id: toTable.table_metadata_id,
            to_table_name: toTable.table_name,
            to_column: column.column_name,
            relationship_type: 'many-to-one',
            confidence: 0.9, // High confidence for common patterns
            join_condition: `${fromTable.table_name}.${column.column_name} = ${toTable.table_name}.${column.column_name}`,
          });
        }
      }
    }

    return relationships;
  }

  private calculateConfidence(columnName: string, tableName: string): number {
    let confidence = 0.5; // Base confidence

    // Exact match
    if (columnName.replace(/_id$/, '').replace(/_uid$/, '') === tableName) {
      confidence = 0.95;
    }
    // Contains match
    else if (columnName.includes(tableName) || tableName.includes(columnName.replace(/_id$/, '').replace(/_uid$/, ''))) {
      confidence = 0.75;
    }

    // Boost for standard suffixes
    if (columnName.endsWith('_id') || columnName.endsWith('_uid')) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  async detectCardinality(
    fromTableName: string,
    fromColumn: string,
    toTableName: string,
    toColumn: string
  ): Promise<'one-to-many' | 'many-to-one' | 'many-to-many' | 'one-to-one'> {
    try {
      // Query analytics DB to check uniqueness
      const fromUnique = await executeAnalyticsQuery<{ is_unique: boolean }>(`
        SELECT COUNT(*) = COUNT(DISTINCT ${fromColumn}) as is_unique
        FROM ih.${fromTableName}
        LIMIT 1
      `);

      const toUnique = await executeAnalyticsQuery<{ is_unique: boolean }>(`
        SELECT COUNT(*) = COUNT(DISTINCT ${toColumn}) as is_unique
        FROM ih.${toTableName}
        LIMIT 1
      `);

      const fromIsUnique = fromUnique[0]?.is_unique ?? false;
      const toIsUnique = toUnique[0]?.is_unique ?? false;

      if (fromIsUnique && toIsUnique) return 'one-to-one';
      if (fromIsUnique && !toIsUnique) return 'one-to-many';
      if (!fromIsUnique && toIsUnique) return 'many-to-one';
      return 'many-to-many';
    } catch (error) {
      log.error('Failed to detect cardinality', error as Error, {
        operation: 'detect_cardinality',
        fromTable: fromTableName,
        toTable: toTableName,
      });
      // Default to many-to-one (most common)
      return 'many-to-one';
    }
  }
}

