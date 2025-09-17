import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';
import { createAPILogger, logPerformanceMetric } from '@/lib/logger';

/**
 * Admin Analytics - Schema Information
 * Provides information about available fields and data types in analytics tables
 */
const schemaHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Analytics schema request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    // Get sample data from new aggregated table
    const sampleQuery = `
      SELECT 
        practice,
        practice_primary,
        practice_uid,
        provider_name,
        measure,
        frequency,
        date_index,
        measure_value,
        measure_type
      FROM ih.agg_app_measures 
      LIMIT 5
    `;

    // Get distinct values for key fields
    const measuresQuery = `
      SELECT DISTINCT measure, COUNT(*) as count
      FROM ih.agg_app_measures 
      GROUP BY measure 
      ORDER BY count DESC
    `;

    const frequenciesQuery = `
      SELECT DISTINCT frequency, COUNT(*) as count
      FROM ih.agg_app_measures 
      GROUP BY frequency 
      ORDER BY count DESC
    `;

    console.log('🔍 Getting schema information...');
    
    const [sampleData, measures, frequencies] = await Promise.all([
      executeAnalyticsQuery(sampleQuery, []),
      executeAnalyticsQuery(measuresQuery, []),
      executeAnalyticsQuery(frequenciesQuery, [])
    ]);

    // Define field metadata for simplified aggregated table
    const fieldDefinitions = {
      practice: {
        name: 'Practice',
        type: 'string',
        description: 'Practice name',
        example: sampleData[0]?.practice,
        groupable: true,
        filterable: true
      },
      practice_primary: {
        name: 'Practice Primary',
        type: 'string',
        description: 'Primary practice identifier',
        example: sampleData[0]?.practice_primary,
        groupable: true,
        filterable: true
      },
      practice_uid: {
        name: 'Practice UID',
        type: 'number',
        description: 'Practice unique identifier for filtering',
        example: sampleData[0]?.practice_uid,
        groupable: true,
        filterable: true
      },
      provider_name: {
        name: 'Provider Name',
        type: 'string',
        description: 'Provider name',
        example: sampleData[0]?.provider_name,
        groupable: true,
        filterable: true
      },
      measure: {
        name: 'Measure',
        type: 'string',
        description: 'What is being measured (Charges, Payments)',
        example: sampleData[0]?.measure,
        groupable: true,
        filterable: true,
        allowedValues: measures.map((m: any) => m.measure)
      },
      frequency: {
        name: 'Frequency',
        type: 'string',
        description: 'Time frequency (Monthly, Weekly, Quarterly)',
        example: sampleData[0]?.frequency,
        groupable: true,
        filterable: true,
        allowedValues: frequencies.map((f: any) => f.frequency)
      },
      date_index: {
        name: 'Date Index',
        type: 'date',
        description: 'Date field for filtering, sorting, and chart X-axis',
        example: sampleData[0]?.date_index,
        groupable: false,
        filterable: true
      },
      measure_value: {
        name: 'Value',
        type: 'number',
        description: 'The measured value',
        example: sampleData[0]?.measure_value,
        groupable: false,
        filterable: true,
        aggregatable: true
      },
      measure_type: {
        name: 'Measure Type',
        type: 'string',
        description: 'Type of value (currency, count, etc.)',
        example: sampleData[0]?.measure_type,
        groupable: true,
        filterable: true
      }
    };

    const schemaInfo = {
      tableName: 'ih.agg_app_measures',
      description: 'Pre-aggregated practice and provider performance measures',
      totalRecords: sampleData.length > 0 ? 'Available' : 'No data',
      fields: fieldDefinitions,
      availableMeasures: measures,
      availableFrequencies: frequencies,
      sampleData: sampleData.slice(0, 2)
    };

    console.log('✅ Schema information compiled:', {
      fieldCount: Object.keys(fieldDefinitions).length,
      measureCount: measures.length,
      frequencyCount: frequencies.length
    });

    logPerformanceMetric(logger, 'analytics_schema_query', Date.now() - startTime);

    return createSuccessResponse(schemaInfo, 'Analytics schema information retrieved successfully');
    
  } catch (error) {
    logger.error('Analytics schema error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(schemaHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});
