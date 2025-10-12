import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';
import type { UserContext } from '@/lib/types/rbac';

// Mock user context with super admin access
const testUserContext: UserContext = {
  user_id: '00000000-0000-0000-0000-000000000000',
  email: 'test@example.com',
  current_organization_id: '00000000-0000-0000-0000-000000000000',
  is_super_admin: true,
  all_permissions: ['*:*:*'],
  organizations: [{
    organization_id: '00000000-0000-0000-0000-000000000000',
    name: 'Test Organization',
    slug: 'test-org',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  }],
};

async function testProgressBarChart() {
  console.log('\n🧪 Testing Progress Bar Chart Handler\n');
  console.log('='.repeat(80));

  try {
    // Test Case: Grouped progress bar with entity_name grouping
    const request = {
      chartConfig: {
        chartType: 'progress-bar',
        dataSourceId: 3,
        groupBy: 'entity_name',
        aggregation: 'sum',
        target: 10000000, // 10 million target
        title: 'Revenue Progress by Entity',
        colorPalette: 'default',
      },
      runtimeFilters: {
        measure: 'cash_transfer',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        frequency: 'day',
      },
    };

    console.log('\n📤 Request:');
    console.log(JSON.stringify(request, null, 2));

    console.log('\n⏳ Fetching data...\n');
    const startTime = Date.now();
    const result = await chartDataOrchestrator.orchestrate(request, testUserContext);
    const duration = Date.now() - startTime;

    console.log('\n✅ SUCCESS - Progress bar chart data received\n');
    console.log('⏱️  Duration:', duration, 'ms');
    console.log('\n📊 Chart Data Structure:');
    console.log('  Labels count:', result.chartData.labels.length);
    console.log('  Labels:', result.chartData.labels);
    console.log('  Datasets count:', result.chartData.datasets.length);

    if (result.chartData.datasets.length > 0) {
      const dataset = result.chartData.datasets[0];
      console.log('\n  Dataset 0:');
      console.log('    Label:', dataset.label);
      console.log('    Data (percentages):', dataset.data);
      console.log('    Raw Values:', (dataset as any).rawValues);
      console.log('    Target:', (dataset as any).target);
      console.log('    Aggregation:', (dataset as any).aggregationType);
      console.log('    Measure Type:', dataset.measureType);
      console.log('    Original Measure Type:', (dataset as any).originalMeasureType);
    }

    // Validate the data structure
    console.log('\n🔍 Validation:');

    const validations = [
      {
        name: 'Has labels',
        pass: result.chartData.labels.length > 0,
      },
      {
        name: 'Has datasets',
        pass: result.chartData.datasets.length > 0,
      },
      {
        name: 'Dataset has data',
        pass: result.chartData.datasets[0]?.data.length > 0,
      },
      {
        name: 'Data contains percentages',
        pass: result.chartData.datasets[0]?.measureType === 'percentage',
      },
      {
        name: 'Has raw values',
        pass: Boolean((result.chartData.datasets[0] as any)?.rawValues),
      },
      {
        name: 'Has target',
        pass: (result.chartData.datasets[0] as any)?.target === 10000000,
      },
      {
        name: 'Labels match data length',
        pass: result.chartData.labels.length === result.chartData.datasets[0]?.data.length,
      },
    ];

    validations.forEach(v => {
      const icon = v.pass ? '✅' : '❌';
      console.log(`  ${icon} ${v.name}`);
    });

    const allPassed = validations.every(v => v.pass);
    console.log('\n' + '='.repeat(80));
    console.log(allPassed ? '✅ ALL VALIDATIONS PASSED' : '❌ SOME VALIDATIONS FAILED');
    console.log('='.repeat(80) + '\n');

    // Display sample data for manual verification
    if (result.chartData.labels.length > 0) {
      console.log('\n📈 Sample Progress Bars (first 5):');
      const dataset = result.chartData.datasets[0];
      const rawValues = (dataset as any).rawValues as number[] | undefined;
      const target = (dataset as any).target as number;

      for (let i = 0; i < Math.min(5, result.chartData.labels.length); i++) {
        const label = result.chartData.labels[i];
        const percentage = dataset.data[i] as number;
        const rawValue = rawValues?.[i] ?? 0;

        console.log(`\n  ${i + 1}. ${label}`);
        console.log(`     Raw Value: $${rawValue.toLocaleString()}`);
        console.log(`     Target: $${target.toLocaleString()}`);
        console.log(`     Percentage: ${percentage.toFixed(2)}%`);
        console.log(`     Progress: ${'█'.repeat(Math.min(50, Math.floor(percentage / 2)))} ${percentage.toFixed(1)}%`);
      }
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testProgressBarChart()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
