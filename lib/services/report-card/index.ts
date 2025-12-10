/**
 * Report Card Services
 *
 * Barrel exports for all report card services.
 * Provides factory functions and singleton instances.
 */

// Main RBAC service
export {
  RBACReportCardService,
  createRBACReportCardService,
} from './rbac-report-card-service';

// Collector services (can be used without RBAC context in CLI/cron)
export {
  StatisticsCollectorService,
  statisticsCollector,
} from './statistics-collector';

export {
  TrendAnalysisService,
  trendAnalyzer,
} from './trend-analysis';

export {
  PracticeSizingService,
  practiceSizer,
} from './practice-sizing';

export {
  ReportCardGeneratorService,
  reportCardGenerator,
} from './report-card-generator';

export {
  LocationComparisonService,
  locationComparison,
} from './location-comparison';

// Measures module (standalone function for CLI/cron use)
export { getActiveMeasures } from './measures';
export { RBACMeasureService, createRBACMeasureService } from './measures';

// Internal types (for use within report-card services)
export type * from './types';

// Internal modules for testing
export * as _internal from './internal';
