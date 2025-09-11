import { db } from '@/lib/db';
import { seedRBACData, checkRBACDataExists } from '@/lib/db/rbac-seed';

/**
 * RBAC Migration and Seed Script
 * Run this script to create RBAC tables and seed initial data
 */

async function runRBACMigration() {
  console.log('🚀 Starting RBAC Migration...\n');

  try {
    // Check if RBAC data already exists
    console.log('🔍 Checking if RBAC data already exists...');
    const dataExists = await checkRBACDataExists();
    
    if (dataExists) {
      console.log('✅ RBAC data already exists in the database');
      console.log('ℹ️  If you need to reset RBAC data, run: pnpm rbac:reset\n');
      return;
    }

    console.log('📝 RBAC data not found. Proceeding with migration...\n');

    // Run the seed data (this will create the tables if they don't exist)
    const result = await seedRBACData();
    
    console.log('\n🎉 RBAC Migration completed successfully!');
    console.log('📊 Summary:');
    console.log(`   • ${result.permissions.length} permissions created`);
    console.log(`   • ${result.roles.length} roles created`);
    console.log(`   • ${result.organizations.length} organizations created`);
    console.log('\n🔐 Available roles:');
    result.roles.forEach(role => {
      if (role) {
        console.log(`   • ${role.name}: ${role.description || 'No description'}`);
      }
    });
    console.log('\n✅ Your RBAC system is now ready to use!');

  } catch (error) {
    console.error('❌ RBAC Migration failed:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Ensure your database is running');
    console.error('   2. Check your DATABASE_URL environment variable');
    console.error('   3. Verify database connection permissions');
    console.error('   4. Run: pnpm db:push to apply schema changes first');
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  runRBACMigration();
}

export { runRBACMigration };
