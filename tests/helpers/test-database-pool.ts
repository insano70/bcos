import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

/**
 * TestDatabasePool manages isolated database connections for parallel test execution
 * Each test process gets its own connection pool to ensure complete isolation
 */
export class TestDatabasePool {
  private static pools = new Map<string, ReturnType<typeof postgres>>()
  private static databases = new Map<string, ReturnType<typeof drizzle>>()

  /**
   * Get a database connection for a specific process/context
   * Creates a new connection if one doesn't exist
   */
  static async getConnection(processId: string): Promise<{
    client: ReturnType<typeof postgres>
    db: ReturnType<typeof drizzle>
  }> {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required for tests')
    }

    if (!this.pools.has(processId)) {
      // Create isolated connection for this process
      const client = postgres(process.env.DATABASE_URL, {
        max: 1, // One connection per process for simplicity
        idle_timeout: 0, // Keep connection alive during tests
        max_lifetime: 0, // No connection recycling during tests
        prepare: false, // Disable prepared statements for better isolation
        debug: process.env.NODE_ENV === 'test' && process.env.DEBUG_DB === 'true'
      })

      const db = drizzle(client)

      this.pools.set(processId, client)
      this.databases.set(processId, db)

      // Test connection
      try {
        await client`SELECT 1 as connection_test`
        console.log(`✅ Database connection established for process: ${processId}`)
      } catch (error) {
        console.error(`❌ Failed to establish database connection for process: ${processId}`, error)
        throw error
      }
    }

    return {
      client: this.pools.get(processId)!,
      db: this.databases.get(processId)!
    }
  }

  /**
   * Close connection for a specific process
   */
  static async closeConnection(processId: string): Promise<void> {
    const client = this.pools.get(processId)
    if (client) {
      try {
        await client.end()
        this.pools.delete(processId)
        this.databases.delete(processId)
        console.log(`✅ Database connection closed for process: ${processId}`)
      } catch (error) {
        console.error(`❌ Error closing database connection for process: ${processId}`, error)
      }
    }
  }

  /**
   * Close all active connections
   * Should be called during global teardown
   */
  static async closeAllConnections(): Promise<void> {
    const closePromises: Promise<void>[] = []

    for (const [processId, client] of Array.from(this.pools.entries())) {
      closePromises.push(
        client.end().then(() => {
          console.log(`✅ Closed connection for process: ${processId}`)
        }).catch((error: unknown) => {
          console.error(`❌ Error closing connection for process: ${processId}`, error)
        })
      )
    }

    await Promise.all(closePromises)
    
    this.pools.clear()
    this.databases.clear()
    
    console.log('✅ All database connections closed')
  }

  /**
   * Get statistics about active connections
   */
  static getStats(): {
    activeConnections: number
    processIds: string[]
  } {
    return {
      activeConnections: this.pools.size,
      processIds: Array.from(this.pools.keys())
    }
  }

  /**
   * Check if a connection exists for a process
   */
  static hasConnection(processId: string): boolean {
    return this.pools.has(processId)
  }
}
