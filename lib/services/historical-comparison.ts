import type { AggAppMeasure } from '@/lib/types/analytics';

/**
 * Historical Comparison Service
 * Implements period-over-period and year-over-year analysis tools
 */

export interface ComparisonPeriod {
  id: string;
  label: string;
  description: string;
  getPeriods: (currentDate: Date) => {
    current: { start: Date; end: Date };
    comparison: { start: Date; end: Date };
  };
}

export const COMPARISON_PERIODS: ComparisonPeriod[] = [
  {
    id: 'month_over_month',
    label: 'Month over Month',
    description: 'Compare current month to previous month',
    getPeriods: (currentDate: Date) => {
      const currentStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const currentEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const comparisonStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const comparisonEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
      
      return {
        current: { start: currentStart, end: currentEnd },
        comparison: { start: comparisonStart, end: comparisonEnd }
      };
    }
  },
  {
    id: 'quarter_over_quarter',
    label: 'Quarter over Quarter',
    description: 'Compare current quarter to previous quarter',
    getPeriods: (currentDate: Date) => {
      const currentQuarter = Math.floor(currentDate.getMonth() / 3);
      const currentYear = currentDate.getFullYear();
      
      const currentStart = new Date(currentYear, currentQuarter * 3, 1);
      const currentEnd = new Date(currentYear, currentQuarter * 3 + 3, 0);
      
      const prevQuarter = currentQuarter - 1;
      const prevYear = prevQuarter < 0 ? currentYear - 1 : currentYear;
      const adjustedQuarter = prevQuarter < 0 ? 3 : prevQuarter;
      
      const comparisonStart = new Date(prevYear, adjustedQuarter * 3, 1);
      const comparisonEnd = new Date(prevYear, adjustedQuarter * 3 + 3, 0);
      
      return {
        current: { start: currentStart, end: currentEnd },
        comparison: { start: comparisonStart, end: comparisonEnd }
      };
    }
  },
  {
    id: 'year_over_year',
    label: 'Year over Year',
    description: 'Compare current year to previous year',
    getPeriods: (currentDate: Date) => {
      const currentYear = currentDate.getFullYear();
      
      const currentStart = new Date(currentYear, 0, 1);
      const currentEnd = new Date(currentYear, 11, 31);
      
      const comparisonStart = new Date(currentYear - 1, 0, 1);
      const comparisonEnd = new Date(currentYear - 1, 11, 31);
      
      return {
        current: { start: currentStart, end: currentEnd },
        comparison: { start: comparisonStart, end: comparisonEnd }
      };
    }
  },
  {
    id: 'same_period_last_year',
    label: 'Same Period Last Year',
    description: 'Compare current period to same period last year',
    getPeriods: (currentDate: Date) => {
      const currentStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const currentEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const comparisonStart = new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1);
      const comparisonEnd = new Date(currentDate.getFullYear() - 1, currentDate.getMonth() + 1, 0);
      
      return {
        current: { start: currentStart, end: currentEnd },
        comparison: { start: comparisonStart, end: comparisonEnd }
      };
    }
  }
];

export interface ComparisonResult {
  current: {
    period: string;
    total: number;
    average: number;
    data: AggAppMeasure[];
  };
  comparison: {
    period: string;
    total: number;
    average: number;
    data: AggAppMeasure[];
  };
  analysis: {
    absoluteChange: number;
    percentChange: number;
    trend: 'up' | 'down' | 'flat';
    significance: 'high' | 'medium' | 'low';
  };
}

export class HistoricalComparisonService {
  
  /**
   * Perform period comparison analysis
   */
  comparePeriodsAnalysis(
    currentData: AggAppMeasure[],
    comparisonData: AggAppMeasure[],
    comparisonType: string
  ): ComparisonResult {
    const currentTotal = this.calculateTotal(currentData);
    const comparisonTotal = this.calculateTotal(comparisonData);
    
    const currentAverage = currentData.length > 0 ? currentTotal / currentData.length : 0;
    const comparisonAverage = comparisonData.length > 0 ? comparisonTotal / comparisonData.length : 0;
    
    const absoluteChange = currentTotal - comparisonTotal;
    const percentChange = comparisonTotal !== 0 ? (absoluteChange / comparisonTotal) * 100 : 0;
    
    const trend = absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'flat';
    const significance = this.calculateSignificance(Math.abs(percentChange));
    
    return {
      current: {
        period: this.formatPeriod(currentData),
        total: currentTotal,
        average: currentAverage,
        data: currentData
      },
      comparison: {
        period: this.formatPeriod(comparisonData),
        total: comparisonTotal,
        average: comparisonAverage,
        data: comparisonData
      },
      analysis: {
        absoluteChange,
        percentChange,
        trend,
        significance
      }
    };
  }

  /**
   * Generate comparison chart data for visualization
   */
  generateComparisonChartData(result: ComparisonResult): {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor: string;
      borderColor: string;
    }>;
  } {
    // Group data by time periods for comparison visualization
    const currentByPeriod = this.groupByTimePeriod(result.current.data);
    const comparisonByPeriod = this.groupByTimePeriod(result.comparison.data);
    
    const allPeriods = new Set([
      ...Object.keys(currentByPeriod),
      ...Object.keys(comparisonByPeriod)
    ]);
    
    const labels = Array.from(allPeriods).sort();
    
    return {
      labels,
      datasets: [
        {
          label: result.current.period,
          data: labels.map(period => currentByPeriod[period] || 0),
          backgroundColor: '#00AEEF',
          borderColor: '#00AEEF'
        },
        {
          label: result.comparison.period,
          data: labels.map(period => comparisonByPeriod[period] || 0),
          backgroundColor: '#67bfff',
          borderColor: '#67bfff'
        }
      ]
    };
  }

  /**
   * Get available comparison periods
   */
  getAvailableComparisons(): ComparisonPeriod[] {
    return COMPARISON_PERIODS;
  }

  /**
   * Calculate trend analysis for multiple periods
   */
  analyzeTrend(measures: AggAppMeasure[], periods: number = 12): {
    trendDirection: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    trendStrength: number; // 0-1 scale
    seasonality: boolean;
    volatility: number;
    forecast?: number;
  } {
    if (measures.length < 3) {
      return {
        trendDirection: 'stable',
        trendStrength: 0,
        seasonality: false,
        volatility: 0
      };
    }

    const values = measures
      .sort((a, b) => new Date(a.date_index).getTime() - new Date(b.date_index).getTime())
      .map(m => m.measure_value);

    // Calculate linear trend
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((sum, val) => sum + val, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      const xDiff = i - xMean;
      const yDiff = (values[i] ?? 0) - yMean;
      numerator += xDiff * yDiff;
      denominator += xDiff * xDiff;
    }
    
    const slope = denominator !== 0 ? numerator / denominator : 0;
    const trendStrength = Math.abs(slope) / Math.max(...values);
    
    // Determine trend direction
    let trendDirection: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    if (trendStrength < 0.01) {
      trendDirection = 'stable';
    } else if (this.calculateVolatility(values) > 0.3) {
      trendDirection = 'volatile';
    } else {
      trendDirection = slope > 0 ? 'increasing' : 'decreasing';
    }

    // Check for seasonality (simple check for repeating patterns)
    const seasonality = this.detectSeasonality(values);
    
    // Calculate volatility
    const volatility = this.calculateVolatility(values);

    return {
      trendDirection,
      trendStrength: Math.min(trendStrength, 1),
      seasonality,
      volatility,
      forecast: this.simpleForecast(values)
    };
  }

  private calculateTotal(measures: AggAppMeasure[]): number {
    return measures.reduce((sum, measure) => {
      // Ensure measure_value is treated as a number, not concatenated as string
      const value = typeof measure.measure_value === 'string' 
        ? parseFloat(measure.measure_value) 
        : measure.measure_value;
      
      // Only add valid numbers
      return sum + (isNaN(value) ? 0 : value);
    }, 0);
  }

  private formatPeriod(measures: AggAppMeasure[]): string {
    if (measures.length === 0) return 'No data';
    
    const dates = measures.map(m => new Date(m.date_index));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    if (minDate.getTime() === maxDate.getTime()) {
      return minDate.toLocaleDateString();
    }
    
    return `${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}`;
  }

  private calculateSignificance(percentChange: number): 'high' | 'medium' | 'low' {
    if (percentChange >= 20) return 'high';
    if (percentChange >= 5) return 'medium';
    return 'low';
  }

  private groupByTimePeriod(measures: AggAppMeasure[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    
    measures.forEach(measure => {
      const period = measure.date_index;
      grouped[period] = (grouped[period] || 0) + measure.measure_value;
    });
    
    return grouped;
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return mean !== 0 ? stdDev / mean : 0;
  }

  private detectSeasonality(values: number[]): boolean {
    // Simple seasonality detection - look for repeating patterns
    if (values.length < 12) return false;
    
    // Check for quarterly patterns (every 3 months)
    const quarterlyCorrelation = this.calculateAutocorrelation(values, 3);
    
    // Check for annual patterns (every 12 months)
    const annualCorrelation = this.calculateAutocorrelation(values, 12);
    
    return quarterlyCorrelation > 0.5 || annualCorrelation > 0.5;
  }

  private calculateAutocorrelation(values: number[], lag: number): number {
    if (values.length <= lag) return 0;
    
    const n = values.length - lag;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      const x = (values[i] ?? 0) - mean;
      const y = (values[i + lag] ?? 0) - mean;
      numerator += x * y;
      denominator += x * x;
    }
    
    return denominator !== 0 ? numerator / denominator : 0;
  }

  private simpleForecast(values: number[]): number {
    if (values.length < 3) return values[values.length - 1] || 0;
    
    // Simple linear extrapolation
    const recent = values.slice(-3);
    const trend = ((recent[2] ?? 0) - (recent[0] ?? 0)) / 2;
    
    return (recent[2] ?? 0) + trend;
  }
}

// Export singleton instance
export const historicalComparisonService = new HistoricalComparisonService();
