import {
  boolean,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { organizations } from './rbac-schema';
import { chart_data_sources } from './chart-config-schema';

/**
 * Report Card Schema
 * Tables for practice performance metrics, trends, and report card generation.
 * Statistics are collected from the external analytics database (ih.agg_app_measures)
 * and stored here for trend analysis and report card generation.
 */

/**
 * Aggregated practice metrics collected from analytics DB
 * Stores historical metric values by practice, measure, and time period
 */
export const report_card_statistics = pgTable(
  'report_card_statistics',
  {
    statistic_id: integer('statistic_id').primaryKey().generatedByDefaultAsIdentity(),
    practice_uid: integer('practice_uid').notNull(),
    organization_id: uuid('organization_id').references(() => organizations.organization_id, {
      onDelete: 'set null',
    }),
    measure_name: varchar('measure_name', { length: 100 }).notNull(),
    time_period: varchar('time_period', { length: 20 }).default('Monthly'),
    period_date: timestamp('period_date', { withTimezone: true }).notNull(),
    value: decimal('value', { precision: 18, scale: 2 }).notNull(),
    collected_at: timestamp('collected_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    practiceIdx: index('idx_report_card_statistics_practice').on(table.practice_uid),
    measureIdx: index('idx_report_card_statistics_measure').on(table.measure_name),
    periodIdx: index('idx_report_card_statistics_period').on(table.period_date),
    orgIdx: index('idx_report_card_statistics_org').on(table.organization_id),
    uniqueEntry: unique('uq_report_card_statistics').on(
      table.practice_uid,
      table.measure_name,
      table.time_period,
      table.period_date
    ),
  })
);

/**
 * Calculated trend analysis for each practice/measure combination
 * Trends are calculated for 3, 6, and 9 month periods
 */
export const report_card_trends = pgTable(
  'report_card_trends',
  {
    trend_id: integer('trend_id').primaryKey().generatedByDefaultAsIdentity(),
    practice_uid: integer('practice_uid').notNull(),
    organization_id: uuid('organization_id').references(() => organizations.organization_id, {
      onDelete: 'set null',
    }),
    measure_name: varchar('measure_name', { length: 100 }).notNull(),
    trend_period: varchar('trend_period', { length: 20 }).notNull(), // '3_month', '6_month', '9_month'
    trend_direction: varchar('trend_direction', { length: 20 }).notNull(), // 'improving', 'declining', 'stable'
    trend_percentage: decimal('trend_percentage', { precision: 8, scale: 2 }),
    calculated_at: timestamp('calculated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    practiceIdx: index('idx_report_card_trends_practice').on(table.practice_uid),
    periodIdx: index('idx_report_card_trends_period').on(table.trend_period),
    measureIdx: index('idx_report_card_trends_measure').on(table.measure_name),
    orgIdx: index('idx_report_card_trends_org').on(table.organization_id),
    uniqueTrend: unique('uq_report_card_trends').on(
      table.practice_uid,
      table.measure_name,
      table.trend_period
    ),
  })
);

/**
 * Practice sizing assignments based on monthly charges
 * Practices are assigned to buckets: small, medium, large, xlarge
 */
export const practice_size_buckets = pgTable(
  'practice_size_buckets',
  {
    bucket_id: integer('bucket_id').primaryKey().generatedByDefaultAsIdentity(),
    practice_uid: integer('practice_uid').notNull().unique(),
    organization_id: uuid('organization_id').references(() => organizations.organization_id, {
      onDelete: 'set null',
    }),
    size_bucket: varchar('size_bucket', { length: 20 }).notNull(), // 'small', 'medium', 'large', 'xlarge'
    monthly_charges_avg: decimal('monthly_charges_avg', { precision: 18, scale: 2 }),
    percentile: decimal('percentile', { precision: 5, scale: 2 }),
    calculated_at: timestamp('calculated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    bucketIdx: index('idx_practice_size_buckets_bucket').on(table.size_bucket),
    orgIdx: index('idx_practice_size_buckets_org').on(table.organization_id),
  })
);

/**
 * Configurable measure weights and display settings
 * Managed through admin interface for weighting report card scores.
 *
 * Measures can define custom filter criteria to query specific data combinations:
 * - filter_criteria: JSON object of column:value pairs for WHERE clause
 *   e.g., {"measure": "Visits", "entity_name": "New Patient"} generates
 *   WHERE measure = 'Visits' AND entity_name = 'New Patient'
 * - value_column: The column to aggregate (SUM), defaults to 'numeric_value'
 * - data_source_id: Reference to chart_data_sources for schema awareness
 */
export const report_card_measures = pgTable(
  'report_card_measures',
  {
    measure_id: integer('measure_id').primaryKey().generatedByDefaultAsIdentity(),
    measure_name: varchar('measure_name', { length: 100 }).notNull().unique(),
    display_name: varchar('display_name', { length: 100 }).notNull(),
    weight: decimal('weight', { precision: 3, scale: 1 }).default('5.0'), // 1-10 scale
    is_active: boolean('is_active').default(true),
    higher_is_better: boolean('higher_is_better').default(true),
    format_type: varchar('format_type', { length: 20 }).default('number'), // 'number', 'currency', 'percentage'
    // Data source and filtering configuration
    data_source_id: integer('data_source_id').references(() => chart_data_sources.data_source_id, {
      onDelete: 'set null',
    }),
    value_column: varchar('value_column', { length: 100 }).default('numeric_value'),
    filter_criteria: jsonb('filter_criteria').default({}), // {"measure": "Charges", "entity_name": "..."}
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    activeIdx: index('idx_report_card_measures_active').on(table.is_active),
    measureNameIdx: index('idx_report_card_measures_name').on(table.measure_name),
    dataSourceIdx: index('idx_report_card_measures_data_source').on(table.data_source_id),
  })
);

/**
 * Generated report cards with overall scores and insights
 * Stores monthly report card snapshots for each practice.
 * 
 * report_card_month: The month this report card is for (first day of month).
 * This enables historical viewing - one report card per practice per month.
 */
export const report_card_results = pgTable(
  'report_card_results',
  {
    result_id: uuid('result_id').primaryKey().defaultRandom(),
    practice_uid: integer('practice_uid').notNull(),
    organization_id: uuid('organization_id').references(() => organizations.organization_id, {
      onDelete: 'set null',
    }),
    /** The month this report card represents (first day of month, e.g., 2025-11-01) */
    report_card_month: date('report_card_month').notNull(),
    generated_at: timestamp('generated_at', { withTimezone: true }).defaultNow(),
    overall_score: decimal('overall_score', { precision: 5, scale: 2 }), // 0-100
    size_bucket: varchar('size_bucket', { length: 20 }),
    percentile_rank: decimal('percentile_rank', { precision: 5, scale: 2 }),
    insights: jsonb('insights'), // Array of insight strings
    measure_scores: jsonb('measure_scores'), // { measure: { score, trend, percentile } }
  },
  (table) => ({
    practiceIdx: index('idx_report_card_results_practice').on(table.practice_uid),
    generatedIdx: index('idx_report_card_results_generated').on(table.generated_at),
    bucketIdx: index('idx_report_card_results_bucket').on(table.size_bucket),
    orgIdx: index('idx_report_card_results_org').on(table.organization_id),
    monthIdx: index('idx_report_card_results_month').on(table.report_card_month),
    practiceMonthIdx: index('idx_report_card_results_practice_month').on(
      table.practice_uid,
      table.report_card_month
    ),
    /** One report card per practice per month */
    uniquePracticeMonth: unique('uq_report_card_practice_month').on(
      table.practice_uid,
      table.report_card_month
    ),
  })
);
