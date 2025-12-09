/**
 * Location Comparison Service
 *
 * Compares metrics across locations within a single practice.
 * Enables practice owners to see performance differences between their locations.
 */

import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { reportCardGenerator } from './report-card-generator';
import type { LocationComparison, LocationMetrics, MeasureConfig } from '@/lib/types/report-card';
import type { LocationMetricsRow } from './types';

/**
 * Location Comparison Service
 *
 * Queries the analytics database to compare performance across locations.
 * 
 * SECURITY: While this service is typically called through the RBAC service layer,
 * it includes defense-in-depth validation via accessiblePractices parameter.
 */
export class LocationComparisonService {
  /**
   * Get location comparison for a practice
   * 
   * @param practiceUid - Practice UID to get comparison for
   * @param measureName - Optional specific measure to compare
   * @param accessiblePractices - Optional array of practice UIDs user can access (defense-in-depth)
   */
  async getComparison(
    practiceUid: number,
    measureName?: string,
    accessiblePractices?: number[]
  ): Promise<LocationComparison> {
    const startTime = Date.now();

    // SECURITY: Defense-in-depth - verify practice access if provided
    if (accessiblePractices !== undefined && accessiblePractices.length > 0) {
      if (!accessiblePractices.includes(practiceUid)) {
        log.security('Location comparison access denied (defense-in-depth)', 'medium', {
          operation: 'get_location_comparison',
          practiceUid,
          accessiblePractices: accessiblePractices.slice(0, 5),
          component: 'report-card',
        });
        throw new Error(`Access denied: User cannot access practice ${practiceUid}`);
      }
    }

    try {
      log.info('Fetching location comparison', {
        operation: 'get_location_comparison',
        practiceUid,
        measureName: measureName || 'all',
        component: 'report-card',
      });

      // Get active measures to include
      const activeMeasures = await this.getActiveMeasures();

      // Validate measureName if provided - must be an active measure
      if (measureName !== undefined) {
        const activeMeasureNames = new Set(activeMeasures.map((m) => m.measure_name));
        if (!activeMeasureNames.has(measureName)) {
          log.warn('Invalid measure name requested for location comparison', {
            operation: 'get_location_comparison',
            practiceUid,
            measureName,
            validMeasures: Array.from(activeMeasureNames).slice(0, 5),
            component: 'report-card',
          });
          throw new Error(`Invalid measure: ${measureName}. Must be an active measure.`);
        }
      }

      const measureNames = measureName
        ? [measureName]
        : activeMeasures.map((m) => m.measure_name);

      if (measureNames.length === 0) {
        return {
          practice_uid: practiceUid,
          locations: [],
          practice_totals: {},
        };
      }

      // Query analytics DB for location-level data
      const locationData = await this.fetchLocationMetrics(practiceUid, measureNames);

      if (locationData.length === 0) {
        return {
          practice_uid: practiceUid,
          locations: [],
          practice_totals: {},
        };
      }

      // Aggregate by location
      const locationMap = new Map<string, Record<string, number>>();
      const practiceTotals: Record<string, number> = {};

      for (const row of locationData) {
        const location = row.location || 'Unknown';
        const measure = row.measure;
        const value = typeof row.measure_value === 'string'
          ? parseFloat(row.measure_value)
          : row.measure_value;

        // Skip invalid values
        if (Number.isNaN(value)) continue;

        // Add to location metrics
        if (!locationMap.has(location)) {
          locationMap.set(location, {});
        }
        const metrics = locationMap.get(location);
        if (metrics) {
          metrics[measure] = (metrics[measure] ?? 0) + value;
        }

        // Add to practice totals
        practiceTotals[measure] = (practiceTotals[measure] || 0) + value;
      }

      // Convert to array and calculate rankings
      const locations = this.calculateRankings(locationMap, activeMeasures);

      const duration = Date.now() - startTime;

      log.info('Location comparison completed', {
        operation: 'get_location_comparison',
        practiceUid,
        locationCount: locations.length,
        measureCount: measureNames.length,
        duration,
        slow: duration > SLOW_THRESHOLDS.DB_QUERY,
        component: 'report-card',
      });

      return {
        practice_uid: practiceUid,
        locations,
        practice_totals: practiceTotals,
      };
    } catch (error) {
      log.error('Location comparison failed', error as Error, {
        operation: 'get_location_comparison',
        practiceUid,
        component: 'report-card',
      });
      throw error;
    }
  }

  /**
   * Fetch location-level metrics from analytics database
   */
  private async fetchLocationMetrics(
    practiceUid: number,
    measureNames: string[]
  ): Promise<LocationMetricsRow[]> {
    // Build IN clause for measures
    const measurePlaceholders = measureNames
      .map((_, i) => `$${i + 2}`)
      .join(', ');

    // Query ih.agg_chart_data with correct column names
    const query = `
      SELECT 
        practice_uid,
        location,
        measure,
        SUM(numeric_value) as measure_value
      FROM ih.agg_chart_data
      WHERE practice_uid = $1
        AND measure IN (${measurePlaceholders})
        AND time_period = 'Monthly'
        AND location IS NOT NULL
        AND location != ''
      GROUP BY practice_uid, location, measure
      ORDER BY location, measure
    `;

    const params = [practiceUid, ...measureNames];

    return executeAnalyticsQuery<LocationMetricsRow>(query, params);
  }

  /**
   * Calculate rankings for locations based on weighted performance
   */
  private calculateRankings(
    locationMap: Map<string, Record<string, number>>,
    measures: MeasureConfig[]
  ): LocationMetrics[] {
    const locations: LocationMetrics[] = [];

    // Convert map to array with calculated composite scores
    const locationScores: Array<{ location: string; metrics: Record<string, number>; compositeScore: number }> = [];

    // Use Array.from for better compatibility
    const entries = Array.from(locationMap.entries());

    for (const entry of entries) {
      const location = entry[0];
      const metrics = entry[1];

      // Calculate weighted composite score for ranking
      let compositeScore = 0;
      let totalWeight = 0;

      for (const measure of measures) {
        const value = metrics[measure.measure_name];
        if (value !== undefined) {
          // Normalize to percentage of max for this location set
          const allValues = Array.from(locationMap.values()).map(
            (m) => m[measure.measure_name] ?? 0
          );
          const maxForMeasure = Math.max(...allValues, 0);

          if (maxForMeasure > 0) {
            let normalizedValue = value / maxForMeasure;

            // If lower is better, invert
            if (!measure.higher_is_better) {
              normalizedValue = 1 - normalizedValue;
            }

            compositeScore += normalizedValue * measure.weight;
            totalWeight += measure.weight;
          }
        }
      }

      const finalScore = totalWeight > 0 ? compositeScore / totalWeight : 0;

      locationScores.push({
        location,
        metrics,
        compositeScore: finalScore,
      });
    }

    // Sort by composite score (descending)
    locationScores.sort((a, b) => b.compositeScore - a.compositeScore);

    // Assign ranks and build final array
    for (const scoreEntry of locationScores) {
      locations.push({
        location: scoreEntry.location,
        metrics: scoreEntry.metrics,
        rank: locations.length + 1,
      });
    }

    return locations;
  }

  /**
   * Get active measures configuration
   * Delegates to reportCardGenerator for DRY principle
   */
  private async getActiveMeasures(): Promise<MeasureConfig[]> {
    return reportCardGenerator.getActiveMeasures();
  }

  /**
   * Get unique locations for a practice
   */
  async getLocationsForPractice(practiceUid: number): Promise<string[]> {
    const query = `
      SELECT DISTINCT location
      FROM ih.agg_chart_data
      WHERE practice_uid = $1
        AND location IS NOT NULL
        AND location != ''
      ORDER BY location
    `;

    const rows = await executeAnalyticsQuery<{ location: string }>(query, [practiceUid]);

    return rows.map((r) => r.location);
  }
}

// Export singleton instance
export const locationComparison = new LocationComparisonService();
