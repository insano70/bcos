#!/usr/bin/env tsx

/**
 * Migration Script: Populate Services and Conditions
 * 
 * This script populates existing practice_attributes records with default
 * services and conditions_treated data that were previously hardcoded.
 */

import { db, practice_attributes } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';

// Default services from templates
const DEFAULT_SERVICES = [
  'Rheumatoid Arthritis Treatment',
  'Lupus Management',
  'Infusion Therapy',
  'Joint Injections',
  'Osteoporosis Treatment',
  'Clinical Research'
];

// Default conditions from templates
const DEFAULT_CONDITIONS = [
  'Rheumatoid Arthritis',
  'Psoriatic Arthritis',
  'Lupus',
  'Gout',
  'Osteoporosis',
  'Osteoarthritis'
];

async function migrateServicesAndConditions() {
  console.log('🚀 Starting services and conditions migration...');
  
  try {
    // Get all practice_attributes records
    const allAttributes = await db
      .select({
        practice_attribute_id: practice_attributes.practice_attribute_id,
        practice_id: practice_attributes.practice_id,
        services: practice_attributes.services,
        conditions_treated: practice_attributes.conditions_treated
      })
      .from(practice_attributes);

    console.log(`📊 Found ${allAttributes.length} practice attribute records`);

    let updatedCount = 0;

    for (const attributes of allAttributes) {
      const updates: any = {};
      let needsUpdate = false;

      // Check if services need to be populated
      if (!attributes.services || attributes.services === null) {
        updates.services = JSON.stringify(DEFAULT_SERVICES);
        needsUpdate = true;
        console.log(`📝 Adding default services to practice ${attributes.practice_id}`);
      } else {
        // Check if it's empty array
        try {
          const parsed = JSON.parse(attributes.services);
          if (!Array.isArray(parsed) || parsed.length === 0) {
            updates.services = JSON.stringify(DEFAULT_SERVICES);
            needsUpdate = true;
            console.log(`📝 Replacing empty services for practice ${attributes.practice_id}`);
          }
        } catch {
          // Invalid JSON, replace with defaults
          updates.services = JSON.stringify(DEFAULT_SERVICES);
          needsUpdate = true;
          console.log(`📝 Fixing invalid services JSON for practice ${attributes.practice_id}`);
        }
      }

      // Check if conditions need to be populated
      if (!attributes.conditions_treated || attributes.conditions_treated === null) {
        updates.conditions_treated = JSON.stringify(DEFAULT_CONDITIONS);
        needsUpdate = true;
        console.log(`📝 Adding default conditions to practice ${attributes.practice_id}`);
      } else {
        // Check if it's empty array
        try {
          const parsed = JSON.parse(attributes.conditions_treated);
          if (!Array.isArray(parsed) || parsed.length === 0) {
            updates.conditions_treated = JSON.stringify(DEFAULT_CONDITIONS);
            needsUpdate = true;
            console.log(`📝 Replacing empty conditions for practice ${attributes.practice_id}`);
          }
        } catch {
          // Invalid JSON, replace with defaults
          updates.conditions_treated = JSON.stringify(DEFAULT_CONDITIONS);
          needsUpdate = true;
          console.log(`📝 Fixing invalid conditions JSON for practice ${attributes.practice_id}`);
        }
      }

      // Update if needed
      if (needsUpdate) {
        updates.updated_at = new Date();
        
        await db
          .update(practice_attributes)
          .set(updates)
          .where(eq(practice_attributes.practice_attribute_id, attributes.practice_attribute_id));
        
        updatedCount++;
        console.log(`✅ Updated practice ${attributes.practice_id}`);
      } else {
        console.log(`⏭️  Practice ${attributes.practice_id} already has services and conditions`);
      }
    }

    console.log(`🎉 Migration completed! Updated ${updatedCount} out of ${allAttributes.length} practices`);
    
    // Verify the migration
    console.log('\n🔍 Verification: Checking updated records...');
    const verificationRecords = await db
      .select({
        practice_id: practice_attributes.practice_id,
        services: practice_attributes.services,
        conditions_treated: practice_attributes.conditions_treated
      })
      .from(practice_attributes)
      .limit(3);

    verificationRecords.forEach((record, index) => {
      console.log(`\n📋 Sample Record ${index + 1}:`);
      console.log(`Practice ID: ${record.practice_id}`);
      console.log(`Services: ${record.services ? 'Populated' : 'NULL'}`);
      console.log(`Conditions: ${record.conditions_treated ? 'Populated' : 'NULL'}`);
      
      if (record.services) {
        try {
          const services = JSON.parse(record.services);
          console.log(`  - ${services.length} services`);
        } catch {
          console.log('  - Invalid services JSON');
        }
      }
      
      if (record.conditions_treated) {
        try {
          const conditions = JSON.parse(record.conditions_treated);
          console.log(`  - ${conditions.length} conditions`);
        } catch {
          console.log('  - Invalid conditions JSON');
        }
      }
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  migrateServicesAndConditions()
    .then(() => {
      console.log('\n✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateServicesAndConditions, DEFAULT_SERVICES, DEFAULT_CONDITIONS };
