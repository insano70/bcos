/**
 * Internal Module Exports for Testing
 *
 * This module exports internal components for testing purposes.
 * Import via: import { _internal } from '@/lib/services/report-card';
 *
 * @example
 * ```typescript
 * import { _internal } from '@/lib/services/report-card';
 *
 * describe('ScoreCalculator', () => {
 *   it('calculates percentile correctly', () => {
 *     const result = _internal.scoreCalculator.calculatePercentile(80, [70, 75, 80, 90], true);
 *     expect(result).toBe(50);
 *   });
 * });
 * ```
 */

// Scoring
export { ScoreCalculator, scoreCalculator } from './scoring';

// Data
export { DataPreloader, dataPreloader } from './data';
export { ResultMapper, resultMapper } from './data';

// Analytics
export { AnnualReviewCalculator, annualReviewCalculator } from './analytics';
export { PeerStatisticsCalculator, peerStatisticsCalculator } from './analytics';

// Measures
export { getActiveMeasures, RBACMeasureService, createRBACMeasureService } from './measures';
export type { MeasureQueryOptions } from './measures';
