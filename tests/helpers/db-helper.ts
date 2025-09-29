import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'

let testClient: ReturnType<typeof postgres> | null = null
let testDb: ReturnType<typeof drizzle> | null = null
let mainTransactionActive: boolean = false
let testSavepointName: string | null = null

/**
 * Get the test database instance
 * Creates a new connection if one doesn't exist
 */
export function getTestDb() {
  if (!testClient) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required for tests')
    }
    testClient = postgres(process.env.DATABASE_URL, { max: 1 })
    testDb = drizzle(testClient)
  }
  return testDb!
}

/**
 * Initialize main transaction for the test session
 * This starts a long-running transaction that spans all tests
 */
export async function initializeMainTransaction(): Promise<void> {
  if (mainTransactionActive) {
    return // Already initialized
  }

  // Initialize the database connection first
  const db = getTestDb()
  const client = getTestClient()
  
  try {
    // Start a main transaction for the entire test session
    await client.unsafe('BEGIN')
    mainTransactionActive = true
    // TEST: console.log('🚀 Main test transaction started')
  } catch (error) {
    // TEST: console.error('❌ Failed to start main transaction:', error)
    throw error
  }
}

/**
 * Start a savepoint for individual test isolation
 */
export async function getTestTransaction() {
  // Ensure main transaction is active
  if (!mainTransactionActive) {
    await initializeMainTransaction()
  }
  
  const client = getTestClient()
  
  // Create a unique savepoint name for this test
  const savepointName = `test_savepoint_${Date.now()}_${Math.random().toString(36).slice(2)}`
  testSavepointName = savepointName
  
  // Create the savepoint within the main transaction
  await client.unsafe(`SAVEPOINT ${savepointName}`)
  
  // TEST: console.log(`🔄 Created savepoint: ${savepointName}`)
  
  // Return the regular database instance
  // All operations will happen within the savepoint
  return getTestDb()
}

/**
 * Rollback to the test savepoint
 * This undoes all changes made during the individual test
 */
export async function rollbackTransaction(): Promise<void> {
  if (testSavepointName) {
    try {
      const client = getTestClient()
      await client.unsafe(`ROLLBACK TO SAVEPOINT ${testSavepointName}`)
      await client.unsafe(`RELEASE SAVEPOINT ${testSavepointName}`)
      
      // TEST: console.log(`🔄 Rolled back to savepoint: ${testSavepointName}`)
      testSavepointName = null
    } catch (error) {
      // TEST: console.error('❌ Error during savepoint rollback:', error)
      testSavepointName = null
      throw error
    }
  }
}

/**
 * Get the current test database instance
 */
export function getCurrentTransaction() {
  if (!testSavepointName) {
    throw new Error('No active savepoint. Make sure getTestTransaction() is called in test setup.')
  }
  return getTestDb()
}

/**
 * Get the raw PostgreSQL client
 */
function getTestClient() {
  if (!testClient) {
    throw new Error('Test client not initialized. Call getTestDb() first.')
  }
  return testClient
}

/**
 * Rollback the main transaction and cleanup
 * This should be called at the end of all tests
 */
export async function rollbackMainTransaction(): Promise<void> {
  if (mainTransactionActive) {
    try {
      const client = getTestClient()
      await client.unsafe('ROLLBACK')
      mainTransactionActive = false
      // TEST: console.log('🔄 Main test transaction rolled back')
    } catch (error) {
      // TEST: console.error('❌ Error rolling back main transaction:', error)
      mainTransactionActive = false
    }
  }
}

/**
 * Execute a function within a test transaction
 * Automatically handles rollback on completion or error
 */
export async function withTestTransaction<T>(
  fn: (tx: any) => Promise<T>
): Promise<T> {
  const tx = await getTestTransaction()
  try {
    const result = await fn(tx)
    return result
  } finally {
    await rollbackTransaction()
  }
}

/**
 * Clean up the test database connection
 * Should be called after all tests complete
 */
export async function cleanupTestDb(): Promise<void> {
  // Rollback any active savepoint first
  if (testSavepointName) {
    await rollbackTransaction()
  }

  // Rollback the main transaction
  await rollbackMainTransaction()

  // Close the database connection
  if (testClient) {
    await testClient.end()
    testClient = null
    testDb = null
    mainTransactionActive = false
    testSavepointName = null
  }
}
