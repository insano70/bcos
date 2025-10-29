import { BedrockRuntimeClient, InvokeModelCommand, type InvokeModelCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { BaseRBACService } from '@/lib/rbac/base-service';
import { db } from '@/lib/db';
import { createRBACExplorerMetadataService } from './index';
import type { UserContext } from '@/lib/types/rbac';
import type { BedrockOptions, GenerateSQLResult, TableMetadata } from '@/lib/types/data-explorer';
import { env } from '@/lib/env';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

export interface BedrockServiceInterface {
  generateSQL(query: string, options?: BedrockOptions): Promise<GenerateSQLResult>;
  explainSQL(sql: string): Promise<string>;
}

export class BedrockService extends BaseRBACService implements BedrockServiceInterface {
  private client: BedrockRuntimeClient;

  constructor(userContext: UserContext) {
    super(userContext, db);
    this.client = new BedrockRuntimeClient({
      region: env.AWS_BEDROCK_REGION,
      ...(env.AWS_BEDROCK_ACCESS_KEY_ID && env.AWS_BEDROCK_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.AWS_BEDROCK_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_BEDROCK_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  async generateSQL(query: string, options: BedrockOptions = {}): Promise<GenerateSQLResult> {
    const startTime = Date.now();

    this.requireAnyPermission(['data-explorer:query:organization', 'data-explorer:query:all']);

    const metadataService = createRBACExplorerMetadataService(this.userContext);
    const tableMetadata = await metadataService.getTableMetadata({ schema_name: 'ih', is_active: true, tier: 1 });

    const prompt = this.buildPrompt(query, tableMetadata, options);
    const modelId = options.model || env.DATA_EXPLORER_MODEL_ID;
    const temperature = options.temperature || env.DATA_EXPLORER_TEMPERATURE;

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: env.DATA_EXPLORER_MAX_TOKENS,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    try {
      const response: InvokeModelCommandOutput = await this.client.send(command);
      const raw = response.body ? new TextDecoder().decode(response.body as Uint8Array) : '{}';
      const responseBody = JSON.parse(raw);

      const firstContent = Array.isArray(responseBody.content) && responseBody.content.length > 0 ? responseBody.content[0] : { text: '' };
      const text: string = typeof firstContent.text === 'string' ? firstContent.text : '';

      const generatedSQL = this.extractSQL(text);
      const tablesUsed = this.extractTablesUsed(generatedSQL);

      const duration = Date.now() - startTime;
      log.info('Bedrock SQL generation completed', {
        operation: 'bedrock_generate_sql',
        resourceType: 'explorer_query',
        userId: this.userContext.user_id,
        organizationId: this.userContext.current_organization_id,
        duration,
        slow: duration > SLOW_THRESHOLDS.LLM_CALL,
        model: modelId,
        tokensUsed:
          (responseBody.usage?.input_tokens ?? 0) + (responseBody.usage?.output_tokens ?? 0),
        tablesUsed,
        component: 'ai',
      });

      const result: GenerateSQLResult = {
        sql: generatedSQL,
        explanation: options.include_explanation ? this.extractExplanation(text) : undefined,
        tables_used: tablesUsed,
        estimated_complexity: this.estimateComplexity(generatedSQL),
        model_used: modelId,
        prompt_tokens: responseBody.usage?.input_tokens ?? 0,
        completion_tokens: responseBody.usage?.output_tokens ?? 0,
        query_history_id: '',
      };

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      log.error('Bedrock SQL generation failed', error as Error, {
        operation: 'bedrock_generate_sql',
        userId: this.userContext.user_id,
        organizationId: this.userContext.current_organization_id,
        duration,
        component: 'ai',
      });
      throw error;
    }
  }

  async explainSQL(sql: string): Promise<string> {
    this.requireAnyPermission(['data-explorer:query:organization', 'data-explorer:query:all']);
    const command = new InvokeModelCommand({
      modelId: env.DATA_EXPLORER_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1000,
        temperature: 0.1,
        messages: [{ role: 'user', content: `Explain this PostgreSQL query in plain English:\n\n${sql}` }],
      }),
    });
    const response = await this.client.send(command);
    const raw = response.body ? new TextDecoder().decode(response.body as Uint8Array) : '{}';
    const responseBody = JSON.parse(raw);
    const firstContent = Array.isArray(responseBody.content) && responseBody.content.length > 0 ? responseBody.content[0] : { text: '' };
    return typeof firstContent.text === 'string' ? firstContent.text : '';
  }

  private buildPrompt(query: string, metadata: TableMetadata[], _options: BedrockOptions): string {
    const tableDescriptions = metadata
      .map((t) => `${t.table_name}: ${t.description || 'No description available'}`)
      .join('\n');

    return `You are an expert PostgreSQL SQL generator for a healthcare analytics database.

DATABASE CONTEXT:
- Schema: ih (healthcare data warehouse)
- Database: PostgreSQL 17
- All queries are READ-ONLY
- Tables contain healthcare data (patients, encounters, claims, etc.)

AVAILABLE TABLES (Tier 1):
${tableDescriptions}

IMPORTANT PATTERNS:
- Date columns usually end with '_date' or '_dt'
- Amount columns usually end with '_amount' or '_amt'
- Organization filtering uses 'practice_uid' (INTEGER)
- Patient identification uses 'patient_id'
- Most tables have created_at and updated_at timestamps
- Always use 'ih.' schema prefix for tables

USER QUESTION: ${query}

Generate a PostgreSQL query that answers this question.

REQUIREMENTS:
1. Use the 'ih' schema prefix for all tables (e.g., ih.patients)
2. Include comments explaining complex logic
3. Add appropriate JOINs based on the relationships
4. Use efficient query patterns (avoid SELECT *)
5. Include appropriate date formatting
6. Do NOT add LIMIT clause (will be added automatically)
7. Ensure practice_uid exists in all tables used (for security filtering)

OUTPUT FORMAT:
Return only the SQL query with inline comments. No additional text.`;
  }

  private extractSQL(response: string): string {
    const safe = typeof response === 'string' ? response : '';
    const sqlMatch = safe.match(/```sql\n([\s\S]*?)\n```/);
    const group = sqlMatch?.[1];
    return group ? group.trim() : safe.trim();
  }

  private extractExplanation(response: string): string {
    const safe = typeof response === 'string' ? response : '';
    const marker = '```sql';
    const idx = safe.indexOf(marker);
    if (idx > 0) {
      return safe.slice(0, idx).trim();
    }
    return '';
  }

  private extractTablesUsed(sql: string): string[] {
    const tablePattern = /FROM\s+ih\.(\w+)|JOIN\s+ih\.(\w+)/gi;
    const matches = Array.from(sql.matchAll(tablePattern));
    const set = new Set<string>();
    for (const m of matches) {
      const name = (m[1] as string | undefined) || (m[2] as string | undefined);
      if (name) set.add(name);
    }
    return Array.from(set);
  }

  private estimateComplexity(sql: string): 'simple' | 'moderate' | 'complex' {
    const joinCount = (sql.match(/JOIN/gi) || []).length;
    const subqueryCount = (sql.match(/SELECT.*FROM.*SELECT/gi) || []).length;
    if (subqueryCount > 0 || joinCount > 3) return 'complex';
    if (joinCount > 0) return 'moderate';
    return 'simple';
  }
}
