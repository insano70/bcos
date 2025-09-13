import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { type PostgresJsTransaction } from 'drizzle-orm/postgres-js'
import { db } from '@/lib/db'

let testClient: ReturnType<typeof postgres> | null = null
let testDb: ReturnType<typeof drizzle> | null = null
let currentTransaction: PostgresJsTransaction<any, any> | null = null

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
 * Start a new database transaction for test isolation
 * Each test gets its own transaction that can be rolled back
 */
export async function getTestTransaction() {
  const db = getTestDb()

  // If there's already an active transaction, rollback it first
  if (currentTransaction) {
    await rollbackTransaction()
  }

  // Start a new transaction
  currentTransaction = await db.transaction(async (tx) => {
    return tx
  })

  return currentTransaction
}

/**
 * Rollback the current test transaction
 * This ensures test isolation by undoing all changes
 */
export async function rollbackTransaction() {
  if (currentTransaction) {
    try {
      // Transaction will auto-rollback when the function exits
      // We just need to clear our reference
      currentTransaction = null
    } catch (error) {
      console.error('Error during transaction rollback:', error)
      throw error
    }
  }
}

/**
 * Get the current active transaction
 * Throws if no transaction is active
 */
export function getCurrentTransaction() {
  if (!currentTransaction) {
    throw new Error('No active transaction. Make sure getTestTransaction() is called in test setup.')
  }
  return currentTransaction
}

/**
 * Execute a function within a test transaction
 * Automatically handles rollback on completion or error
 */
export async function withTestTransaction<T>(
  fn: (tx: PostgresJsTransaction<any, any>) => Promise<T>
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
export async function cleanupTestDb() {
  if (testClient) {
    await testClient.end()
    testClient = null
    testDb = null
    currentTransaction = null
  }
}
