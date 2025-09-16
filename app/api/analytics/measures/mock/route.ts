import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';

/**
 * Mock Analytics Measures API
 * Provides sample data for testing the analytics dashboard without external database
 */

// Generate mock data based on query parameters
function generateMockData(params: URLSearchParams) {
  const measure = params.get('measure') || 'Charges by Practice';
  const frequency = params.get('frequency') || 'Monthly';
  const limit = parseInt(params.get('limit') || '12');

  const mockData = [];
  const currentDate = new Date();
  
  // Generate data for the last 12 months
  for (let i = 0; i < limit; i++) {
    const date = new Date(currentDate);
    date.setMonth(date.getMonth() - i);
    
    const periodStart = date.toISOString().split('T')[0];
    const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
    
    // Generate realistic-looking values based on measure type
    const baseValue = measure.includes('Charges') ? 
      Math.random() * 50000 + 10000 : // $10k-$60k for charges
      Math.random() * 40000 + 8000;   // $8k-$48k for payments
    
    // Add some seasonal variation
    const seasonalMultiplier = 1 + (Math.sin((date.getMonth() / 12) * 2 * Math.PI) * 0.2);
    const measureValue = Math.round(baseValue * seasonalMultiplier);
    
    mockData.push({
      practice_uid: `practice-${Math.floor(Math.random() * 5) + 1}`,
      provider_uid: Math.random() > 0.5 ? `provider-${Math.floor(Math.random() * 10) + 1}` : null,
      measure,
      measure_format: 'currency',
      period_based_on: 'calendar',
      frequency,
      period_start: periodStart,
      period_end: periodEnd,
      date_index: i,
      measure_value: measureValue,
      last_period_value: Math.round(measureValue * (0.95 + Math.random() * 0.1)),
      last_year_value: Math.round(measureValue * (0.9 + Math.random() * 0.2)),
      pct_change_vs_last_period: Math.round((Math.random() - 0.5) * 20 * 100) / 100,
      pct_change_vs_last_year: Math.round((Math.random() - 0.3) * 30 * 100) / 100,
    });
  }
  
  return mockData.reverse(); // Return chronological order
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const mockMeasures = generateMockData(searchParams);
  
  return createSuccessResponse({
    measures: mockMeasures,
    pagination: {
      total_count: mockMeasures.length,
      limit: parseInt(searchParams.get('limit') || '1000'),
      offset: parseInt(searchParams.get('offset') || '0'),
      has_more: false
    },
    metadata: {
      query_time_ms: 150 + Math.random() * 100,
      cache_hit: false,
      analytics_db_latency_ms: 45 + Math.random() * 30
    }
  });
}

/**
 * Health check for mock endpoint
 */
export async function HEAD() {
  return new Response(null, { 
    status: 200,
    headers: {
      'X-Analytics-DB-Latency': '0'
    }
  });
}
