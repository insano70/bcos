import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { TestDatabasePool } from '../helpers/test-database-pool'

/**
 * Global test setup - runs once before all tests in all processes
 * Handles database migrations and global initialization
 */
export async function setup() {
  // TEST: console.log('🚀 Starting global test setup...')
  
  try {
    // Ensure we have a database URL - use same fallback as test-setup.ts
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://bcos_d:oRMgpg2micRfQVXz7Bfbr@localhost:5432/bcos_d'
      // TEST: console.log('📝 Using default DATABASE_URL for tests')
    }

    // TEST: console.log('📊 Initializing test database...')
    
    // Create a migration-specific connection
    const migrationClient = postgres(process.env.DATABASE_URL, { 
      max: 1,
      prepare: false
    })
    
    const migrationDb = drizzle(migrationClient)
    
    try {
      // Skip migrations for now - assume database is already set up
      // TODO: Fix migration path once drizzle migrations are properly configured
      // TEST: console.log('⚠️  Skipping database migrations - assuming database is ready')
      
      // Just test the connection
      await migrationClient`SELECT 1 as connection_test`
      // TEST: console.log('✅ Database connection verified')
    } catch (error) {
      // TEST: console.error('❌ Database connection failed:', error)
      throw error
    } finally {
      // Close migration connection
      await migrationClient.end()
    }

    // Test database connectivity
    // TEST: console.log('🔗 Testing database connectivity...')
    const testProcessId = `global_test_${process.pid}`
    const { client } = await TestDatabasePool.getConnection(testProcessId)
    
    // Verify basic queries work
    await client`SELECT 1 as connectivity_test`
    // TEST: console.log('✅ Database connectivity verified')
    
    // Clean up test connection
    await TestDatabasePool.closeConnection(testProcessId)

    // TEST: console.log('🎉 Global test setup completed successfully')
    
  } catch (error) {
    // TEST: console.error('❌ Global test setup failed:', error)
    throw error
  }
}

/**
 * Global test teardown - runs once after all tests complete
 * Handles global cleanup and connection closure
 */
export async function teardown() {
  // TEST: console.log('🧹 Starting global test teardown...')
  
  try {
    // Close all database connections
    await TestDatabasePool.closeAllConnections()
    
    // Additional cleanup if needed
    // TEST: console.log('✅ Global test teardown completed successfully')
    
  } catch (error) {
    // TEST: console.error('❌ Global test teardown failed:', error)
    // Don't throw here - we want tests to complete even if cleanup fails
  }
}
