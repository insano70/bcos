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
