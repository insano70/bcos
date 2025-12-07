/**
 * Report Card Error Classes
 *
 * Custom error types for report card operations.
 * These errors provide specific context for debugging and user feedback.
 */

/**
 * Base class for report card errors
 */
export class ReportCardError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ReportCardError';
  }
}

/**
 * Error thrown when a report card is not found for a practice or organization
 */
export class ReportCardNotFoundError extends ReportCardError {
  constructor(identifier: number | string) {
    const isOrgId = typeof identifier === 'string';
    super(
      isOrgId
        ? `Report card not found for identifier ${identifier}`
        : `Report card not found for practice ${identifier}`,
      'REPORT_CARD_NOT_FOUND',
      404,
      isOrgId ? { identifier } : { practiceUid: identifier }
    );
    this.name = 'ReportCardNotFoundError';
  }
}

/**
 * Error thrown when there is insufficient data to generate a report card
 */
export class InsufficientDataError extends ReportCardError {
  constructor(practiceUid: number, reason: string) {
    super(
      `Insufficient data for practice ${practiceUid}: ${reason}`,
      'INSUFFICIENT_DATA',
      400,
      { practiceUid, reason }
    );
    this.name = 'InsufficientDataError';
  }
}

/**
 * Error thrown when a measure configuration is not found
 */
export class MeasureNotFoundError extends ReportCardError {
  constructor(measureId: number) {
    super(
      `Measure not found: ${measureId}`,
      'MEASURE_NOT_FOUND',
      404,
      { measureId }
    );
    this.name = 'MeasureNotFoundError';
  }
}

/**
 * Error thrown when a measure already exists (duplicate)
 */
export class MeasureDuplicateError extends ReportCardError {
  constructor(measureName: string) {
    super(
      `Measure already exists: ${measureName}`,
      'MEASURE_DUPLICATE',
      409,
      { measureName }
    );
    this.name = 'MeasureDuplicateError';
  }
}

/**
 * Error thrown when statistics collection fails
 */
export class StatisticsCollectionError extends ReportCardError {
  constructor(reason: string, practiceUid?: number) {
    super(
      practiceUid
        ? `Statistics collection failed for practice ${practiceUid}: ${reason}`
        : `Statistics collection failed: ${reason}`,
      'STATISTICS_COLLECTION_FAILED',
      500,
      { practiceUid, reason }
    );
    this.name = 'StatisticsCollectionError';
  }
}

/**
 * Error thrown when trend analysis fails
 */
export class TrendAnalysisError extends ReportCardError {
  constructor(reason: string, practiceUid?: number, measureName?: string) {
    super(
      `Trend analysis failed: ${reason}`,
      'TREND_ANALYSIS_FAILED',
      500,
      { practiceUid, measureName, reason }
    );
    this.name = 'TrendAnalysisError';
  }
}

