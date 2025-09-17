import { db, chart_data_sources, chart_data_source_columns, chart_display_configs, color_palettes, chart_component_configs } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

/**
 * Seed Chart Configuration Data
 * Populates the chart configuration tables with ih.agg_app_measures setup
 */

async function seedChartConfiguration() {
  try {
    console.log('🔍 Seeding chart configuration data...');

    // 1. Insert the main data source
    const [dataSource] = await db
      .insert(chart_data_sources)
      .values({
        data_source_name: 'Practice Analytics',
        data_source_description: 'Pre-aggregated practice and provider performance measures',
        table_name: 'agg_app_measures',
        schema_name: 'ih',
        database_type: 'postgresql',
        is_active: true,
        requires_auth: true,
      })
      .onConflictDoNothing()
      .returning();

    if (!dataSource) {
      console.log('Data source already exists, getting existing...');
      const [existing] = await db
        .select()
        .from(chart_data_sources)
        .where(and(
          eq(chart_data_sources.table_name, 'agg_app_measures'),
          eq(chart_data_sources.schema_name, 'ih')
        ));
      
      if (!existing) {
        throw new Error('Failed to create or find data source');
      }
      
      console.log('✅ Using existing data source:', existing.data_source_id);
      var dsId = existing.data_source_id;
    } else {
      console.log('✅ Created new data source:', dataSource.data_source_id);
      var dsId = dataSource.data_source_id;
    }

    // 2. Insert column configurations
    const columns = [
      { name: 'practice', display: 'Practice Name', type: 'string', filterable: true, groupable: true, measure: false, dimension: true, format: 'string', order: 1, example: 'Family Arthritis Center' },
      { name: 'practice_primary', display: 'Practice Primary', type: 'string', filterable: true, groupable: true, measure: false, dimension: true, format: 'string', order: 2, example: 'Busch, Howard' },
      { name: 'practice_uid', display: 'Practice UID', type: 'number', filterable: true, groupable: true, measure: false, dimension: true, format: 'number', order: 3, example: '114' },
      { name: 'provider_name', display: 'Provider Name', type: 'string', filterable: true, groupable: true, measure: false, dimension: true, format: 'string', order: 4, example: 'Busch, Howard' },
      { name: 'measure', display: 'Measure Type', type: 'string', filterable: true, groupable: true, measure: false, dimension: true, format: 'string', order: 5, example: 'Charges by Provider' },
      { name: 'frequency', display: 'Frequency', type: 'string', filterable: true, groupable: true, measure: false, dimension: true, format: 'string', order: 6, example: 'Monthly' },
      { name: 'date_index', display: 'Date', type: 'date', filterable: true, groupable: false, measure: false, dimension: true, format: 'date', order: 7, example: '2025-03-31', isDate: true },
      { name: 'measure_value', display: 'Value', type: 'number', filterable: true, groupable: false, measure: true, dimension: false, format: 'currency', order: 8, example: '506992', aggregation: 'sum' },
      { name: 'measure_type', display: 'Measure Type', type: 'string', filterable: true, groupable: true, measure: false, dimension: true, format: 'string', order: 9, example: 'currency' }
    ];

    for (const col of columns) {
      await db
        .insert(chart_data_source_columns)
        .values({
          data_source_id: dsId,
          column_name: col.name,
          display_name: col.display,
          column_description: `${col.display} field from analytics data`,
          data_type: col.type,
          is_filterable: col.filterable,
          is_groupable: col.groupable,
          is_measure: col.measure,
          is_dimension: col.dimension,
          is_date_field: col.isDate || false,
          format_type: col.format,
          sort_order: col.order,
          default_aggregation: col.aggregation || null,
          example_value: col.example,
          is_active: true,
        })
        .onConflictDoNothing();
    }

    console.log('✅ Inserted column configurations');

    // 3. Insert default color palettes
    await db
      .insert(color_palettes)
      .values([
        {
          palette_name: 'Default Analytics',
          palette_description: 'Default color palette for analytics charts',
          colors: ["#00AEEF", "#67bfff", "#3ec972", "#f0bb33", "#ff5656", "oklch(65.6% 0.241 354.308)", "oklch(58.5% 0.233 277.117)", "oklch(70.5% 0.213 47.604)"],
          palette_type: 'categorical',
          max_colors: 8,
          is_colorblind_safe: false,
          is_default: true,
          is_system: true,
        },
        {
          palette_name: 'Accessible Blues',
          palette_description: 'Colorblind-safe blue palette',
          colors: ["#08519c", "#3182bd", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7"],
          palette_type: 'sequential',
          max_colors: 6,
          is_colorblind_safe: true,
          is_default: false,
          is_system: true,
        }
      ])
      .onConflictDoNothing();

    console.log('✅ Inserted color palettes');

    // 4. Insert chart display configurations
    const displayConfigs = [
      // Bar chart configurations
      { type: 'bar', freq: 'Monthly', xAxis: {type: 'category'}, yAxis: {beginAtZero: true}, unit: 'month', display: 'MMM YYYY', tooltip: 'MMM YYYY', legend: true, default: true },
      { type: 'bar', freq: 'Weekly', xAxis: {type: 'category'}, yAxis: {beginAtZero: true}, unit: 'week', display: 'DD-MMM-YY', tooltip: 'DD-MMM-YYYY', legend: true, default: false },
      { type: 'bar', freq: 'Quarterly', xAxis: {type: 'category'}, yAxis: {beginAtZero: true}, unit: 'quarter', display: '[Q]Q YYYY', tooltip: '[Q]Q YYYY', legend: true, default: false },
      
      // Line chart configurations
      { type: 'line', freq: 'Monthly', xAxis: {type: 'time', time: {unit: 'month'}}, yAxis: {beginAtZero: true}, unit: 'month', display: 'MMM YY', tooltip: 'MMM YYYY', legend: false, default: true },
      { type: 'line', freq: 'Weekly', xAxis: {type: 'time', time: {unit: 'week'}}, yAxis: {beginAtZero: true}, unit: 'week', display: 'DD-MMM', tooltip: 'DD-MMM-YYYY', legend: false, default: false },
      { type: 'line', freq: 'Quarterly', xAxis: {type: 'time', time: {unit: 'quarter'}}, yAxis: {beginAtZero: true}, unit: 'quarter', display: '[Q]Q YY', tooltip: '[Q]Q YYYY', legend: false, default: false },
      
      // Pie/Doughnut configurations
      { type: 'pie', freq: null, xAxis: null, yAxis: null, unit: null, display: null, tooltip: null, legend: true, default: true },
      { type: 'doughnut', freq: null, xAxis: null, yAxis: null, unit: null, display: null, tooltip: null, legend: true, default: true }
    ];

    for (const config of displayConfigs) {
      await db
        .insert(chart_display_configs)
        .values({
          chart_type: config.type,
          frequency: config.freq,
          x_axis_config: config.xAxis,
          y_axis_config: config.yAxis,
          time_unit: config.unit,
          time_display_format: config.display,
          time_tooltip_format: config.tooltip,
          show_legend: config.legend,
          show_tooltips: true,
          enable_animation: true,
          is_default: config.default,
          is_active: true,
        })
        .onConflictDoNothing();
    }

    console.log('✅ Inserted chart display configurations');

    // 5. Insert component configurations
    await db
      .insert(chart_component_configs)
      .values([
        {
          component_name: 'AnalyticsBarChart',
          chart_type: 'bar',
          default_props: {barPercentage: 0.7, categoryPercentage: 0.7},
          max_data_points: 1000,
          enable_virtualization: false,
        },
        {
          component_name: 'LineChart01',
          chart_type: 'line',
          default_props: {tension: 0.4, pointRadius: 4},
          max_data_points: 1000,
          enable_virtualization: false,
        },
        {
          component_name: 'DoughnutChart',
          chart_type: 'doughnut',
          default_props: {cutout: '50%'},
          max_data_points: 100,
          enable_virtualization: false,
        }
      ])
      .onConflictDoNothing();

    console.log('✅ Inserted component configurations');
    console.log('🎉 Chart configuration system seeded successfully!');

  } catch (error) {
    console.error('❌ Failed to seed chart configuration:', error);
    throw error;
  }
}

// Run the seeding
seedChartConfiguration()
  .then(() => {
    console.log('✅ Chart configuration seeding completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Chart configuration seeding failed:', error);
    process.exit(1);
  });
