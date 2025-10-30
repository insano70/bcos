import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { explorerQueryPatterns } from '@/lib/db/schema';
import type { UserContext } from '@/lib/types/rbac';
import { and, desc, eq, gte } from 'drizzle-orm';

interface ExtractedPattern {
  pattern_type: 'aggregation' | 'filtering' | 'joining' | 'time-series' | 'simple-select';
  natural_language_pattern: string;
  sql_pattern: string;
  tables_involved: string[];
}

interface QueryPattern {
  query_pattern_id: string;
  pattern_type: string | null;
  natural_language_pattern: string | null;
  sql_pattern: string | null;
  tables_involved: string[] | null;
  usage_count: number;
  success_rate: string | null;
  last_seen: Date;
  created_at: Date;
}

export class ExplorerPatternService extends BaseRBACService {
  constructor(userContext: UserContext) {
    super(userContext, db);
  }

  async extractPattern(
    naturalLanguageQuery: string,
    generatedSQL: string,
    tablesUsed: string[]
  ): Promise<ExtractedPattern> {
    const patternType = this.categorizePattern(generatedSQL);
    
    // Generalize the SQL pattern (replace specific values with placeholders)
    const sqlPattern = this.generalizeSQL(generatedSQL);
    
    // Generalize the natural language (remove specific dates, numbers, names)
    const nlPattern = this.generalizeNaturalLanguage(naturalLanguageQuery);

    return {
      pattern_type: patternType,
      natural_language_pattern: nlPattern,
      sql_pattern: sqlPattern,
      tables_involved: tablesUsed,
    };
  }

  categorizePattern(sql: string): 'aggregation' | 'filtering' | 'joining' | 'time-series' | 'simple-select' {
    const lower = sql.toLowerCase();

    // Time-series: date ranges and grouping by time
    if (
      (lower.includes('date') || lower.includes('time')) &&
      (lower.includes('group by') || lower.includes('order by'))
    ) {
      return 'time-series';
    }

    // Aggregation: COUNT, SUM, AVG, etc.
    if (
      lower.match(/\b(count|sum|avg|min|max|group by)\b/i)
    ) {
      return 'aggregation';
    }

    // Joining: Multiple tables with JOIN
    if (lower.match(/\bjoin\b/i)) {
      return 'joining';
    }

    // Filtering: WHERE clause without aggregation
    if (lower.includes('where') && !lower.match(/\b(count|sum|avg|min|max|group by)\b/i)) {
      return 'filtering';
    }

    // Simple select
    return 'simple-select';
  }

  async findSimilarPatterns(
    naturalLanguageQuery: string,
    limit: number = 10
  ): Promise<QueryPattern[]> {
    this.requireAnyPermission([
      'data-explorer:query:organization',
      'data-explorer:query:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');

    // Find patterns with high usage and success rate
    const patterns = await this.dbContext
      .select()
      .from(explorerQueryPatterns)
      .where(gte(explorerQueryPatterns.usage_count, 2))
      .orderBy(desc(explorerQueryPatterns.usage_count))
      .limit(limit);

    // Filter by similarity (simple keyword matching for now)
    const queryWords = naturalLanguageQuery.toLowerCase().split(/\s+/);
    const scored = patterns.map(pattern => {
      if (!pattern.natural_language_pattern) return { pattern, score: 0 };
      
      const patternWords = pattern.natural_language_pattern.toLowerCase().split(/\s+/);
      const matchingWords = queryWords.filter(w => patternWords.includes(w));
      const score = matchingWords.length / queryWords.length;
      
      return { pattern, score };
    });

    // Return top matches
    return scored
      .filter(s => s.score > 0.3) // At least 30% word overlap
      .sort((a, b) => b.score - a.score)
      .map(s => s.pattern as QueryPattern);
  }

  async updatePatternUsage(
    patternType: string,
    naturalLanguagePattern: string,
    sqlPattern: string,
    tablesInvolved: string[],
    wasSuccessful: boolean
  ): Promise<void> {
    this.requireAnyPermission([
      'data-explorer:query:organization',
      'data-explorer:query:all',
    ]);

    if (!this.dbContext) throw new Error('Database context not initialized');

    // Find existing pattern
    const [existing] = await this.dbContext
      .select()
      .from(explorerQueryPatterns)
      .where(
        and(
          eq(explorerQueryPatterns.pattern_type, patternType),
          eq(explorerQueryPatterns.sql_pattern, sqlPattern)
        )
      )
      .limit(1);

    if (existing) {
      // Update existing pattern
      const currentUsage = existing.usage_count || 0;
      const currentSuccessRate = existing.success_rate ? parseFloat(existing.success_rate) : 0;
      
      const newUsage = currentUsage + 1;
      const newSuccessRate = wasSuccessful
        ? (currentSuccessRate * currentUsage + 1) / newUsage
        : (currentSuccessRate * currentUsage) / newUsage;

      await this.dbContext
        .update(explorerQueryPatterns)
        .set({
          usage_count: newUsage,
          success_rate: newSuccessRate.toFixed(2),
          last_seen: new Date(),
        })
        .where(eq(explorerQueryPatterns.query_pattern_id, existing.query_pattern_id));
    } else {
      // Create new pattern
      await this.dbContext.insert(explorerQueryPatterns).values({
        pattern_type: patternType,
        natural_language_pattern: naturalLanguagePattern,
        sql_pattern: sqlPattern,
        tables_involved: tablesInvolved,
        usage_count: 1,
        success_rate: wasSuccessful ? '1.00' : '0.00',
      });
    }
  }

  private generalizeSQL(sql: string): string {
    return sql
      // Replace specific dates with placeholder
      .replace(/'\d{4}-\d{2}-\d{2}'/g, 'DATE_PLACEHOLDER')
      // Replace specific numbers with placeholder
      .replace(/\b\d+\b/g, 'NUM_PLACEHOLDER')
      // Replace string literals with placeholder
      .replace(/'[^']*'/g, 'STR_PLACEHOLDER')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  private generalizeNaturalLanguage(query: string): string {
    return query
      // Replace specific dates with placeholder
      .replace(/\b\d{4}(-\d{2}){0,2}\b/g, 'DATE')
      // Replace specific numbers with placeholder
      .replace(/\b\d+\b/g, 'NUMBER')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}

