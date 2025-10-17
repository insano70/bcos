import type { AggAppMeasure } from '@/lib/types/analytics';

/**
 * Calculated Fields Service
 * Implements basic formulas for derived metrics like growth rates and ratios
 */

export interface CalculatedField {
  id: string;
  name: string;
  description: string;
  formula: string;
  dependencies: string[]; // Field names this calculation depends on
  calculate: (measures: AggAppMeasure[]) => AggAppMeasure[];
}

export const CALCULATED_FIELDS: CalculatedField[] = [
  {
    id: 'growth_rate',
    name: 'Growth Rate',
    description: 'Period-over-period growth rate percentage',
    formula: '((current - previous) / previous) * 100',
    dependencies: ['measure_value', 'date_index'],
    calculate: (measures: AggAppMeasure[]) => {
      // Helper to safely get date value
      const getDate = (m: AggAppMeasure): string => {
        return (m.date_index ?? m.date_value ?? '') as string;
      };

      // Helper to safely get measure value
      const getMeasureValue = (m: AggAppMeasure): number => {
        const value = m.measure_value ?? m.numeric_value ?? 0;
        return typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? parseFloat(value)
            : 0;
      };

      // Sort by date to calculate period-over-period growth
      const sorted = measures.sort(
        (a, b) => new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime()
      );

      return sorted.map((measure, index) => {
        if (index === 0) {
          // First period has no previous period
          return {
            ...measure,
            measure: 'Growth Rate',
            measure_value: 0,
            measure_type: 'percentage',
          };
        }

        const current = getMeasureValue(measure);
        const previous = getMeasureValue(sorted[index - 1] as AggAppMeasure);
        const growthRate = previous !== 0 ? ((current - previous) / previous) * 100 : 0;

        return {
          ...measure,
          measure: 'Growth Rate',
          measure_value: Math.round(growthRate * 100) / 100, // Round to 2 decimal places
          measure_type: 'percentage',
        };
      });
    },
  },
  {
    id: 'charges_to_payments_ratio',
    name: 'Charges to Payments Ratio',
    description: 'Ratio of charges to payments',
    formula: 'charges / payments',
    dependencies: ['measure', 'measure_value'],
    calculate: (measures: AggAppMeasure[]) => {
      // Helper to safely get date value
      const getDate = (m: AggAppMeasure): string => {
        return (m.date_index ?? m.date_value ?? '') as string;
      };

      // Helper to safely get measure value
      const getMeasureValue = (m: AggAppMeasure): number => {
        const value = m.measure_value ?? m.numeric_value ?? 0;
        return typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? parseFloat(value)
            : 0;
      };

      // Group by provider and date to calculate ratios
      const grouped = new Map<
        string,
        { charges?: number; payments?: number; date: string; provider: string }
      >();

      measures.forEach((measure) => {
        const providerName = (measure.provider_name ?? 'Unknown Provider') as string;
        const measureName = (measure.measure ?? '') as string;

        const key = `${providerName}_${getDate(measure)}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            date: getDate(measure),
            provider: providerName,
          });
        }

        const group = grouped.get(key);
        if (!group) {
          throw new Error(`Group not found for key: ${key}`);
        }
        if (measureName.includes('Charges')) {
          group.charges = getMeasureValue(measure);
        } else if (measureName.includes('Payments')) {
          group.payments = getMeasureValue(measure);
        }
      });

      const ratios: AggAppMeasure[] = [];
      grouped.forEach((group, _key) => {
        if (group.charges && group.payments && group.payments !== 0) {
          const ratio = group.charges / group.payments;
          ratios.push({
            practice: measures[0]?.practice || 'Unknown',
            practice_primary: measures[0]?.practice_primary || 'Unknown',
            practice_uid: measures[0]?.practice_uid || 0,
            provider_name: group.provider,
            measure: 'Charges to Payments Ratio',
            frequency: measures[0]?.frequency || 'Monthly',
            date_index: group.date,
            measure_value: Math.round(ratio * 100) / 100,
            measure_type: 'ratio',
          });
        }
      });

      return ratios;
    },
  },
  {
    id: 'moving_average',
    name: 'Moving Average (3 periods)',
    description: '3-period moving average for trend smoothing',
    formula: '(current + previous + previous2) / 3',
    dependencies: ['measure_value', 'date_index'],
    calculate: (measures: AggAppMeasure[]) => {
      // Helper to safely get date value
      const getDate = (m: AggAppMeasure): string => {
        return (m.date_index ?? m.date_value ?? '') as string;
      };

      // Helper to safely get measure value
      const getMeasureValue = (m: AggAppMeasure): number => {
        const value = m.measure_value ?? m.numeric_value ?? 0;
        return typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? parseFloat(value)
            : 0;
      };

      const sorted = measures.sort(
        (a, b) => new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime()
      );

      return sorted.map((measure, index) => {
        if (index < 2) {
          // Not enough data for 3-period average
          return {
            ...measure,
            measure: 'Moving Average (3 periods)',
            measure_value: getMeasureValue(measure), // Use actual value
            measure_type: 'currency',
          };
        }

        const current = getMeasureValue(measure);
        const previous1 = getMeasureValue(sorted[index - 1] as AggAppMeasure);
        const previous2 = getMeasureValue(sorted[index - 2] as AggAppMeasure);
        const average = (current + previous1 + previous2) / 3;

        return {
          ...measure,
          measure: 'Moving Average (3 periods)',
          measure_value: Math.round(average),
          measure_type: 'currency',
        };
      });
    },
  },
  {
    id: 'variance_from_average',
    name: 'Variance from Average',
    description: 'Percentage variance from overall average',
    formula: '((value - average) / average) * 100',
    dependencies: ['measure_value'],
    calculate: (measures: AggAppMeasure[]) => {
      // Helper to safely get measure value
      const getMeasureValue = (m: AggAppMeasure): number => {
        const value = m.measure_value ?? m.numeric_value ?? 0;
        return typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? parseFloat(value)
            : 0;
      };

      const total = measures.reduce((sum, m) => {
        const value = getMeasureValue(m);
        return sum + (Number.isNaN(value) ? 0 : value);
      }, 0);
      const average = total / measures.length;

      return measures.map((measure) => {
        const measureValue = getMeasureValue(measure);
        const variance = average !== 0 ? ((measureValue - average) / average) * 100 : 0;

        return {
          ...measure,
          measure: 'Variance from Average',
          measure_value: Math.round(variance * 100) / 100,
          measure_type: 'percentage',
        };
      });
    },
  },
];

export class CalculatedFieldsService {
  /**
   * Apply calculated field to measures data
   */
  applyCalculatedField(calculatedFieldId: string, measures: AggAppMeasure[]): AggAppMeasure[] {
    const field = CALCULATED_FIELDS.find((f) => f.id === calculatedFieldId);
    if (!field) {
      throw new Error(`Calculated field not found: ${calculatedFieldId}`);
    }

    return field.calculate(measures);
  }

  /**
   * Get available calculated fields
   */
  getAvailableCalculatedFields(): CalculatedField[] {
    return CALCULATED_FIELDS;
  }

  /**
   * Validate if calculated field can be applied to given measures
   */
  validateCalculatedField(
    calculatedFieldId: string,
    measures: AggAppMeasure[]
  ): {
    canApply: boolean;
    missingDependencies: string[];
  } {
    const field = CALCULATED_FIELDS.find((f) => f.id === calculatedFieldId);
    if (!field) {
      return { canApply: false, missingDependencies: [] };
    }

    if (measures.length === 0) {
      return { canApply: false, missingDependencies: field.dependencies };
    }

    // Check if all required fields are present in the data
    const sampleMeasure = measures[0];
    const availableFields = sampleMeasure ? Object.keys(sampleMeasure) : [];
    const missingDependencies = field.dependencies.filter((dep) => !availableFields.includes(dep));

    return {
      canApply: missingDependencies.length === 0,
      missingDependencies,
    };
  }
}

// Export singleton instance
export const calculatedFieldsService = new CalculatedFieldsService();
