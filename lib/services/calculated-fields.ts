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
      // Sort by date to calculate period-over-period growth
      const sorted = measures.sort(
        (a, b) => new Date(a.date_index).getTime() - new Date(b.date_index).getTime()
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

        const current = measure.measure_value;
        const previous = sorted[index - 1]?.measure_value ?? 0;
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
      // Group by provider and date to calculate ratios
      const grouped = new Map<
        string,
        { charges?: number; payments?: number; date: string; provider: string }
      >();

      measures.forEach((measure) => {
        const key = `${measure.provider_name}_${measure.date_index}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            date: measure.date_index,
            provider: measure.provider_name,
          });
        }

        const group = grouped.get(key);
        if (!group) {
          throw new Error(`Group not found for key: ${key}`);
        }
        if (measure.measure.includes('Charges')) {
          group.charges = measure.measure_value;
        } else if (measure.measure.includes('Payments')) {
          group.payments = measure.measure_value;
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
      const sorted = measures.sort(
        (a, b) => new Date(a.date_index).getTime() - new Date(b.date_index).getTime()
      );

      return sorted.map((measure, index) => {
        if (index < 2) {
          // Not enough data for 3-period average
          return {
            ...measure,
            measure: 'Moving Average (3 periods)',
            measure_value: measure.measure_value, // Use actual value
            measure_type: 'currency',
          };
        }

        const current = measure.measure_value;
        const previous1 = sorted[index - 1]?.measure_value ?? 0;
        const previous2 = sorted[index - 2]?.measure_value ?? 0;
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
      const total = measures.reduce((sum, m) => {
        const value =
          typeof m.measure_value === 'string' ? parseFloat(m.measure_value) : m.measure_value;
        return sum + (Number.isNaN(value) ? 0 : value);
      }, 0);
      const average = total / measures.length;

      return measures.map((measure) => {
        const measureValue =
          typeof measure.measure_value === 'string'
            ? parseFloat(measure.measure_value)
            : measure.measure_value;
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
