/**
 * Data Explorer Metadata Seeding Script
 *
 * Seeds initial metadata for Tier 1 tables in the ih (analytics) schema.
 * This provides the AI with context for better SQL generation.
 *
 * Usage:
 *   pnpm exec tsx --env-file=.env.local scripts/seed-explorer-metadata.ts
 */

import { db } from '@/lib/db';
import { explorerTableMetadata } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { log } from '@/lib/logger';

const TIER_1_TABLES = [
  {
    schema_name: 'ih',
    table_name: 'patients',
    display_name: 'Patients',
    description: 'Core patient demographic and registration information',
    row_meaning: 'Each row represents a unique patient in the healthcare system',
    primary_entity: 'patient',
    common_filters: ['practice_uid', 'created_at', 'date_of_birth'],
    common_joins: ['encounters ON patients.patient_id = encounters.patient_id'],
    tier: 1,
    sample_questions: [
      'How many patients do we have?',
      'How many new patients were added last month?',
      'What is the average age of our patients?',
    ],
    tags: ['core', 'demographics'],
    is_active: true,
  },
  {
    schema_name: 'ih',
    table_name: 'encounters',
    display_name: 'Encounters',
    description: 'Patient visits and appointments including inpatient and outpatient encounters',
    row_meaning: 'Each row represents a single patient visit or encounter',
    primary_entity: 'encounter',
    common_filters: ['practice_uid', 'encounter_date', 'encounter_type'],
    common_joins: [
      'patients ON encounters.patient_id = patients.patient_id',
      'providers ON encounters.provider_uid = providers.provider_uid',
    ],
    tier: 1,
    sample_questions: [
      'How many patient visits did we have last month?',
      'What is the average encounter duration?',
      'Which providers saw the most patients?',
    ],
    tags: ['core', 'visits'],
    is_active: true,
  },
  {
    schema_name: 'ih',
    table_name: 'diagnoses',
    description: 'Diagnosis codes (ICD-10) associated with patient encounters',
    row_meaning: 'Each row represents a diagnosis recorded for a patient encounter',
    primary_entity: 'diagnosis',
    common_filters: ['practice_uid', 'diagnosis_date', 'icd_code'],
    common_joins: [
      'encounters ON diagnoses.encounter_id = encounters.encounter_id',
      'patients ON diagnoses.patient_id = patients.patient_id',
    ],
    tier: 1,
    sample_questions: [
      'What are the most common diagnosis codes?',
      'How many diabetes diagnoses were made this year?',
      'Which conditions are trending upward?',
    ],
    tags: ['clinical', 'icd-10'],
    is_active: true,
  },
  {
    schema_name: 'ih',
    table_name: 'procedures',
    display_name: 'Procedures',
    description: 'Procedures performed (CPT codes) during patient encounters',
    row_meaning: 'Each row represents a medical procedure performed',
    primary_entity: 'procedure',
    common_filters: ['practice_uid', 'procedure_date', 'cpt_code'],
    common_joins: ['encounters ON procedures.encounter_id = encounters.encounter_id'],
    tier: 1,
    sample_questions: [
      'What are the most frequently performed procedures?',
      'How many procedures were done last quarter?',
      'What is the average procedure revenue?',
    ],
    tags: ['clinical', 'cpt', 'billing'],
    is_active: true,
  },
  {
    schema_name: 'ih',
    table_name: 'claims',
    display_name: 'Claims',
    description: 'Insurance claims submitted for patient encounters and procedures',
    row_meaning: 'Each row represents an insurance claim submission',
    primary_entity: 'claim',
    common_filters: ['practice_uid', 'submitted_date', 'payer_name', 'claim_status'],
    common_joins: ['encounters ON claims.encounter_id = encounters.encounter_id'],
    tier: 1,
    sample_questions: [
      'What is our claim denial rate?',
      'How many claims are pending payment?',
      'What is the average time to payment by payer?',
    ],
    tags: ['financial', 'billing', 'insurance'],
    is_active: true,
  },
  {
    schema_name: 'ih',
    table_name: 'payments',
    display_name: 'Payments',
    description: 'Payment transactions received for submitted claims',
    row_meaning: 'Each row represents a payment received from payer or patient',
    primary_entity: 'payment',
    common_filters: ['practice_uid', 'payment_date', 'payment_method'],
    common_joins: ['claims ON payments.claim_id = claims.claim_id'],
    tier: 1,
    sample_questions: [
      'What is our total revenue this month?',
      'What is the average payment processing time?',
      'Which payers pay fastest?',
    ],
    tags: ['financial', 'revenue'],
    is_active: true,
  },
  {
    schema_name: 'ih',
    table_name: 'providers',
    display_name: 'Providers',
    description: 'Healthcare providers (doctors, nurses, staff) who deliver care',
    row_meaning: 'Each row represents a healthcare provider',
    primary_entity: 'provider',
    common_filters: ['practice_uid', 'provider_type', 'is_active'],
    common_joins: ['encounters ON providers.provider_uid = encounters.provider_uid'],
    tier: 1,
    sample_questions: [
      'How many providers do we have?',
      'Which providers have the highest patient volume?',
      'What is the provider productivity trend?',
    ],
    tags: ['core', 'staff'],
    is_active: true,
  },
  {
    schema_name: 'ih',
    table_name: 'organizations',
    display_name: 'Organizations',
    description: 'Healthcare organizations and practices in the system',
    row_meaning: 'Each row represents a healthcare organization or practice',
    primary_entity: 'organization',
    common_filters: ['is_active', 'organization_type'],
    common_joins: ['patients ON organizations.practice_uid = patients.practice_uid'],
    tier: 1,
    sample_questions: [
      'How many active organizations are there?',
      'What is the patient distribution across organizations?',
    ],
    tags: ['core', 'administrative'],
    is_active: true,
  },
  {
    schema_name: 'ih',
    table_name: 'medications',
    display_name: 'Medications',
    description: 'Prescribed medications and pharmaceutical orders',
    row_meaning: 'Each row represents a medication prescription',
    primary_entity: 'medication',
    common_filters: ['practice_uid', 'prescription_date', 'medication_name'],
    common_joins: ['patients ON medications.patient_id = patients.patient_id'],
    tier: 1,
    sample_questions: [
      'What are the most commonly prescribed medications?',
      'How many prescriptions were written last month?',
      'Which medications have the highest refill rates?',
    ],
    tags: ['clinical', 'pharmacy'],
    is_active: true,
  },
  {
    schema_name: 'ih',
    table_name: 'lab_results',
    display_name: 'Lab Results',
    description: 'Laboratory test results and diagnostic findings',
    row_meaning: 'Each row represents a single lab test result',
    primary_entity: 'lab_result',
    common_filters: ['practice_uid', 'result_date', 'test_type'],
    common_joins: [
      'encounters ON lab_results.encounter_id = encounters.encounter_id',
      'patients ON lab_results.patient_id = patients.patient_id',
    ],
    tier: 1,
    sample_questions: [
      'How many lab tests were performed this quarter?',
      'What percentage of tests have abnormal results?',
      'Which tests are ordered most frequently?',
    ],
    tags: ['clinical', 'diagnostics'],
    is_active: true,
  },
];

async function seedExplorerMetadata() {
  log.info('Starting Data Explorer metadata seeding', {
    operation: 'seed_explorer_metadata',
    tableCount: TIER_1_TABLES.length,
  });

  try {
    for (const table of TIER_1_TABLES) {
      const [existing] = await db
        .select()
        .from(explorerTableMetadata)
        .where(
          and(
            eq(explorerTableMetadata.schema_name, table.schema_name),
            eq(explorerTableMetadata.table_name, table.table_name)
          )
        )
        .limit(1);

      if (existing) {
        log.info('Table metadata already exists, skipping', {
          tableName: table.table_name,
        });
        continue;
      }

      await db.insert(explorerTableMetadata).values(table);

      log.info('Table metadata seeded', {
        tableName: table.table_name,
        tier: table.tier,
      });
    }

    log.info('Data Explorer metadata seeding completed successfully', {
      operation: 'seed_explorer_metadata',
      tablesSeeded: TIER_1_TABLES.length,
    });

    process.exit(0);
  } catch (error) {
    log.error('Data Explorer metadata seeding failed', error as Error, {
      operation: 'seed_explorer_metadata',
    });
    process.exit(1);
  }
}

seedExplorerMetadata();

