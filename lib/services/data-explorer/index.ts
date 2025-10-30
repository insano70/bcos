import type { UserContext } from '@/lib/types/rbac';
import { ExplorerMetadataService } from './explorer-metadata-service';
import { QueryExecutorService } from './query-executor-service';
import { BedrockService } from './bedrock-service';
import { ExplorerHistoryService } from './explorer-history-service';
import { QuerySecurityService } from './query-security-service';
import { SchemaDiscoveryService } from './schema-discovery-service';
import { ExplorerRelationshipService } from './explorer-relationship-service';
import { ExplorerPatternService } from './explorer-pattern-service';
import { ColumnStatisticsService } from './column-statistics-service';
import { FeedbackService } from './feedback-service';
import { SuggestionGeneratorService } from './suggestion-generator';
import { FeedbackAnalyticsService } from './feedback-analytics-service';
import { FeedbackNotificationService } from './feedback-notification-service';
import { TestCaseGeneratorService } from './test-case-generator';
import { analyzeSQLDiff } from './sql-diff-analyzer';
import { analyzeFeedback, analyzeFeedbackBatch } from './feedback-analyzer';

export function createRBACExplorerMetadataService(userContext: UserContext): ExplorerMetadataService {
  return new ExplorerMetadataService(userContext);
}

export function createRBACExplorerQueryExecutorService(
  userContext: UserContext
): QueryExecutorService {
  return new QueryExecutorService(userContext);
}

export function createRBACExplorerBedrockService(userContext: UserContext): BedrockService {
  return new BedrockService(userContext);
}

export function createRBACExplorerHistoryService(
  userContext: UserContext
): ExplorerHistoryService {
  return new ExplorerHistoryService(userContext);
}

export function createRBACExplorerQuerySecurityService(
  userContext: UserContext
): QuerySecurityService {
  return new QuerySecurityService(userContext);
}

export function createRBACExplorerSchemaDiscoveryService(
  userContext: UserContext
): SchemaDiscoveryService {
  return new SchemaDiscoveryService(userContext);
}

export function createRBACExplorerRelationshipService(
  userContext: UserContext
): ExplorerRelationshipService {
  return new ExplorerRelationshipService(userContext);
}

export function createRBACExplorerPatternService(
  userContext: UserContext
): ExplorerPatternService {
  return new ExplorerPatternService(userContext);
}

export function createRBACExplorerColumnStatisticsService(
  userContext: UserContext
): ColumnStatisticsService {
  return new ColumnStatisticsService(userContext);
}

export function createRBACExplorerFeedbackService(userContext: UserContext): FeedbackService {
  return new FeedbackService(userContext);
}

export function createRBACExplorerSuggestionGeneratorService(
  userContext: UserContext
): SuggestionGeneratorService {
  return new SuggestionGeneratorService(userContext);
}

// Export feedback analyzer utility functions (not RBAC-based)
export { analyzeFeedback, analyzeFeedbackBatch };

export function createRBACExplorerFeedbackAnalyticsService(
  userContext: UserContext
): FeedbackAnalyticsService {
  return new FeedbackAnalyticsService(userContext);
}

export function createRBACExplorerFeedbackNotificationService(
  userContext: UserContext
): FeedbackNotificationService {
  return new FeedbackNotificationService(userContext);
}

export function createRBACExplorerTestCaseGeneratorService(
  userContext: UserContext
): TestCaseGeneratorService {
  return new TestCaseGeneratorService(userContext);
}

// Export SQL diff analyzer (not RBAC-based, utility function)
export { analyzeSQLDiff };
