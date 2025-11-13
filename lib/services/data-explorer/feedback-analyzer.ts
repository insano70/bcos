/**
 * AI-Powered Feedback Analyzer
 * Uses AWS Bedrock to analyze feedback and generate actionable insights
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { log } from '@/lib/logger';
import type { QueryFeedback } from '@/lib/types/data-explorer';
import { analyzeSQLDiff, generateDiffSummary, type SQLDiffResult } from './sql-diff-analyzer';

// Initialize Bedrock client (credentials from environment)
const client = new BedrockRuntimeClient({
  region: 'us-east-1', // Default region for Bedrock
});

export interface FeedbackAnalysisResult {
  detectedIssue: string;
  rootCause: string;
  affectedTables: string[];
  affectedColumns: string[];
  suggestedFixes: SuggestedFix[];
  confidence: number;
  sqlDiff: SQLDiffResult | null;
  diffSummary: string | null;
}

export interface SuggestedFix {
  type: 'metadata' | 'instruction' | 'relationship' | 'prompt';
  target: string; // table/column/relationship name
  action: string; // what to do
  description: string; // why this helps
  confidence: number; // 0-1
  priority: 'high' | 'medium' | 'low';
}

/**
 * Analyze feedback using AI to extract insights and generate suggestions
 */
export async function analyzeFeedback(
  feedback: QueryFeedback
): Promise<FeedbackAnalysisResult> {
  const startTime = Date.now();

  try {
    // First, analyze SQL differences if corrected SQL is provided
    let sqlDiff: SQLDiffResult | null = null;
    let diffSummary: string | null = null;

    if (feedback.corrected_sql) {
      sqlDiff = analyzeSQLDiff(feedback.original_sql, feedback.corrected_sql);
      diffSummary = generateDiffSummary(sqlDiff);
    }

    // Build prompt for AI analysis
    const prompt = buildAnalysisPrompt(feedback, sqlDiff, diffSummary);

    // Call Bedrock for analysis
    const response = await client.send(
      new ConverseCommand({
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          temperature: 0.3, // Lower temperature for more consistent analysis
          maxTokens: 2000,
        },
      })
    );

    // Parse AI response
    const aiResponse =
      response.output?.message?.content?.[0]?.text || '{"error": "No response"}';

    let analysisResult: FeedbackAnalysisResult;

    try {
      const parsed = JSON.parse(aiResponse);
      analysisResult = {
        detectedIssue: parsed.detectedIssue || 'Unable to determine issue',
        rootCause: parsed.rootCause || 'Unknown',
        affectedTables: parsed.affectedTables || [],
        affectedColumns: parsed.affectedColumns || [],
        suggestedFixes: parsed.suggestedFixes || [],
        confidence: parsed.confidence || 0.5,
        sqlDiff,
        diffSummary,
      };
    } catch (_parseError) {
      // Fallback if AI doesn't return valid JSON
      analysisResult = {
        detectedIssue: aiResponse.substring(0, 500),
        rootCause: feedback.feedback_category,
        affectedTables: sqlDiff?.addedTables || [],
        affectedColumns: [],
        suggestedFixes: [],
        confidence: 0.3,
        sqlDiff,
        diffSummary,
      };
    }

    const duration = Date.now() - startTime;

    log.info('Feedback analysis completed', {
      operation: 'analyze_feedback',
      feedbackId: feedback.feedback_id,
      detectedIssue: analysisResult.detectedIssue,
      suggestedFixCount: analysisResult.suggestedFixes.length,
      confidence: analysisResult.confidence,
      duration,
      component: 'business-logic',
    });

    return analysisResult;
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Feedback analysis failed', error, {
      operation: 'analyze_feedback',
      feedbackId: feedback.feedback_id,
      duration,
      component: 'business-logic',
    });

    // Return fallback analysis
    return {
      detectedIssue: 'Analysis failed',
      rootCause: feedback.feedback_category,
      affectedTables: [],
      affectedColumns: [],
      suggestedFixes: [],
      confidence: 0.1,
      sqlDiff: null,
      diffSummary: null,
    };
  }
}

/**
 * Build analysis prompt for Bedrock
 */
function buildAnalysisPrompt(
  feedback: QueryFeedback,
  sqlDiff: SQLDiffResult | null,
  diffSummary: string | null
): string {
  return `You are an expert SQL analyst helping improve an AI-powered Data Explorer system. Analyze this user feedback about an incorrectly generated SQL query.

**User's Question:**
${feedback.query_history_id}

**Original SQL (AI-generated):**
\`\`\`sql
${feedback.original_sql}
\`\`\`

${
  feedback.corrected_sql
    ? `**Corrected SQL (User-fixed):**
\`\`\`sql
${feedback.corrected_sql}
\`\`\`

**SQL Differences:**
${diffSummary || 'No diff analysis available'}
`
    : ''
}

**User's Feedback:**
- Type: ${feedback.feedback_type}
- Category: ${feedback.feedback_category}
- Severity: ${feedback.severity}
${feedback.user_explanation ? `- Explanation: ${feedback.user_explanation}` : ''}

${
  sqlDiff
    ? `**Detected Changes:**
- Added tables: ${sqlDiff.addedTables.join(', ') || 'none'}
- Removed tables: ${sqlDiff.removedTables.join(', ') || 'none'}
- Added joins: ${sqlDiff.addedJoins.length}
- Added filters: ${sqlDiff.addedFilters.length}
- Structural changes: ${sqlDiff.structuralChanges.map((c) => c.description).join(', ') || 'none'}
`
    : ''
}

**Your Task:**
Analyze this feedback and provide actionable insights to improve the Data Explorer system.

**Return your analysis as JSON with this exact structure:**
\`\`\`json
{
  "detectedIssue": "Clear description of what went wrong",
  "rootCause": "Why the AI generated incorrect SQL",
  "affectedTables": ["list", "of", "table", "names"],
  "affectedColumns": ["list", "of", "column", "names"],
  "suggestedFixes": [
    {
      "type": "metadata|instruction|relationship|prompt",
      "target": "table or column name",
      "action": "specific action to take",
      "description": "why this fix will help",
      "confidence": 0.85,
      "priority": "high|medium|low"
    }
  ],
  "confidence": 0.85
}
\`\`\`

**Guidelines:**
1. Be specific about which tables/columns need improvement
2. Suggest concrete, actionable fixes
3. Prioritize fixes by impact (high = frequently affects queries)
4. Confidence should reflect how certain you are about the fix
5. Focus on systemic improvements, not one-off fixes

Return ONLY the JSON, no additional text.`;
}

/**
 * Batch analyze multiple feedback entries to find patterns
 */
export async function analyzeFeedbackBatch(
  feedbackList: QueryFeedback[]
): Promise<{
  commonIssues: string[];
  affectedTables: Map<string, number>;
  affectedColumns: Map<string, number>;
  suggestedFixes: SuggestedFix[];
  patterns: FeedbackPattern[];
}> {
  const startTime = Date.now();

  try {
    // Analyze each feedback entry
    const analyses = await Promise.all(feedbackList.map((fb) => analyzeFeedback(fb)));

    // Aggregate results
    const commonIssues: Map<string, number> = new Map();
    const affectedTables: Map<string, number> = new Map();
    const affectedColumns: Map<string, number> = new Map();
    const allSuggestedFixes: SuggestedFix[] = [];

    for (const analysis of analyses) {
      // Count issue types
      commonIssues.set(
        analysis.detectedIssue,
        (commonIssues.get(analysis.detectedIssue) || 0) + 1
      );

      // Count affected tables
      for (const table of analysis.affectedTables) {
        affectedTables.set(table, (affectedTables.get(table) || 0) + 1);
      }

      // Count affected columns
      for (const column of analysis.affectedColumns) {
        affectedColumns.set(column, (affectedColumns.get(column) || 0) + 1);
      }

      // Collect all suggested fixes
      allSuggestedFixes.push(...analysis.suggestedFixes);
    }

    // Identify patterns
    const patterns = identifyPatterns(analyses, feedbackList);

    // Deduplicate and prioritize suggested fixes
    const suggestedFixes = deduplicateFixes(allSuggestedFixes);

    const duration = Date.now() - startTime;

    log.info('Batch feedback analysis completed', {
      operation: 'analyze_feedback_batch',
      feedbackCount: feedbackList.length,
      commonIssueCount: commonIssues.size,
      affectedTableCount: affectedTables.size,
      suggestedFixCount: suggestedFixes.length,
      patternCount: patterns.length,
      duration,
      component: 'business-logic',
    });

    return {
      commonIssues: Array.from(commonIssues.entries())
        .sort((a, b) => b[1] - a[1])
        .map((e) => e[0]),
      affectedTables,
      affectedColumns,
      suggestedFixes,
      patterns,
    };
  } catch (error) {
    log.error('Batch feedback analysis failed', error, {
      operation: 'analyze_feedback_batch',
      feedbackCount: feedbackList.length,
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    return {
      commonIssues: [],
      affectedTables: new Map(),
      affectedColumns: new Map(),
      suggestedFixes: [],
      patterns: [],
    };
  }
}

export interface FeedbackPattern {
  pattern: string;
  frequency: number;
  severity: 'high' | 'medium' | 'low';
  examples: string[];
  suggestedFix: string;
}

/**
 * Identify recurring patterns in feedback
 */
function identifyPatterns(
  analyses: FeedbackAnalysisResult[],
  feedbackList: QueryFeedback[]
): FeedbackPattern[] {
  const patterns: FeedbackPattern[] = [];

  // Group by root cause
  const byCause = new Map<string, number>();
  for (const analysis of analyses) {
    byCause.set(analysis.rootCause, (byCause.get(analysis.rootCause) || 0) + 1);
  }

  // Create patterns for frequent issues
  for (const [cause, count] of Array.from(byCause.entries())) {
    if (count >= 2) {
      // Pattern threshold
      const examples = feedbackList
        .filter((_, i) => analyses[i]?.rootCause === cause)
        .slice(0, 3)
        .map((fb) => fb.user_explanation || fb.feedback_type);

      patterns.push({
        pattern: cause,
        frequency: count,
        severity: count >= 5 ? 'high' : count >= 3 ? 'medium' : 'low',
        examples,
        suggestedFix: `Address ${cause} systematically`,
      });
    }
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

/**
 * Deduplicate and prioritize suggested fixes
 */
function deduplicateFixes(fixes: SuggestedFix[]): SuggestedFix[] {
  const uniqueFixes = new Map<string, SuggestedFix>();

  for (const fix of fixes) {
    const key = `${fix.type}:${fix.target}:${fix.action}`;
    const existing = uniqueFixes.get(key);

    if (!existing || fix.confidence > existing.confidence) {
      uniqueFixes.set(key, fix);
    }
  }

  return Array.from(uniqueFixes.values()).sort((a, b) => {
    // Sort by priority then confidence
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });
}

