import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * TestDatabasePool manages isolated database connections for parallel test execution
 * Each test process gets its own connection pool to ensure complete isolation
 */
export class TestDatabasePool {
  // Private constructor prevents instantiation - this is a static utility class
  private constructor() {}

  private static pools = new Map<string, ReturnType<typeof postgres>>();
  private static databases = new Map<string, ReturnType<typeof drizzle>>();

  /**
   * Get a database connection for a specific process/context
   * Creates a new connection if one doesn't exist
   */
  static async getConnection(processId: string): Promise<{
    client: ReturnType<typeof postgres>;
    db: ReturnType<typeof drizzle>;
  }> {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required for tests');
    }

    if (!TestDatabasePool.pools.has(processId)) {
      // Create isolated connection for this process
      const client = postgres(process.env.DATABASE_URL, {
        max: 1, // One connection per process for simplicity
        idle_timeout: 0, // Keep connection alive during tests
        max_lifetime: 0, // No connection recycling during tests
        prepare: false, // Disable prepared statements for better isolation
        debug: process.env.NODE_ENV === 'test' && process.env.DEBUG_DB === 'true',
      });

      const db = drizzle(client);

      TestDatabasePool.pools.set(processId, client);
      TestDatabasePool.databases.set(processId, db);
      await client`SELECT 1 as connection_test`;
    }

    const poolClient = TestDatabasePool.pools.get(processId);
    const poolDb = TestDatabasePool.databases.get(processId);

    if (!poolClient || !poolDb) {
      throw new Error(`Failed to initialize database pool for process ${processId}`);
    }

    return {
      client: poolClient,
      db: poolDb,
    };
  }

  /**
   * Close connection for a specific process
   */
  static async closeConnection(processId: string): Promise<void> {
    const client = TestDatabasePool.pools.get(processId);
    if (client) {
      try {
        await client.end();
        TestDatabasePool.pools.delete(processId);
        TestDatabasePool.databases.delete(processId);
        // TEST: console.log(`✅ Database connection closed for process: ${processId}`)
      } catch (_error) {
        // TEST: console.error(`❌ Error closing database connection for process: ${processId}`, error)
      }
    }
  }

  /**
   * Close all active connections
   * Should be called during global teardown
   */
  static async closeAllConnections(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const [_processId, client] of Array.from(TestDatabasePool.pools.entries())) {
      closePromises.push(
        client
          .end()
          .then(() => {
            // TEST: console.log(`✅ Closed connection for process: ${processId}`)
          })
          .catch((_error: unknown) => {
            // TEST: console.error(`❌ Error closing connection for process: ${processId}`, error)
          })
      );
    }

    await Promise.all(closePromises);

    TestDatabasePool.pools.clear();
    TestDatabasePool.databases.clear();

    // TEST: console.log('✅ All database connections closed')
  }

  /**
   * Get statistics about active connections
   */
  static getStats(): {
    activeConnections: number;
    processIds: string[];
  } {
    return {
      activeConnections: TestDatabasePool.pools.size,
      processIds: Array.from(TestDatabasePool.pools.keys()),
    };
  }

  /**
   * Check if a connection exists for a process
   */
  static hasConnection(processId: string): boolean {
    return TestDatabasePool.pools.has(processId);
  }
}
