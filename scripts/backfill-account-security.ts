#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import { isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { account_security, users } from '@/lib/db/schema';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

/**
 * Account Security Backfill Script
 * Creates account_security records for all existing users
 * with HIPAA-compliant default values
 */

// Simple console logger for script execution
const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    console.log(`ℹ️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  success: (message: string, data?: Record<string, unknown>) => {
    console.log(`✅ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, data?: Record<string, unknown>) => {
    console.error(`❌ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(`⚠️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
};

interface BackfillStats {
  totalUsers: number;
  existingRecords: number;
  recordsCreated: number;
  errors: number;
  errorDetails: Array<{ userId: string; error: string }>;
}

async function backfillAccountSecurity() {
  const stats: BackfillStats = {
    totalUsers: 0,
    existingRecords: 0,
    recordsCreated: 0,
    errors: 0,
    errorDetails: [],
  };

  let client: postgres.Sql | null = null;

  try {
    logger.info('Starting account_security backfill process...');

    // Check for DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    logger.info('Connecting to database...');

    // Create database connection
    client = postgres(databaseUrl, {
      max: 1, // Single connection for migration script
      prepare: false,
    });

    const db = drizzle(client);

    // Get all active users (not deleted)
    logger.info('Fetching all active users...');
    const allUsers = await db
      .select({
        user_id: users.user_id,
        email: users.email,
      })
      .from(users)
      .where(isNull(users.deleted_at));

    stats.totalUsers = allUsers.length;
    logger.info(`Found ${stats.totalUsers} active users`);

    if (stats.totalUsers === 0) {
      logger.warn('No users found in database. Nothing to backfill.');
      return stats;
    }

    // Check existing account_security records
    logger.info('Checking existing account_security records...');
    const existingSecurityRecords = await db
      .select({
        user_id: account_security.user_id,
      })
      .from(account_security);

    const existingUserIds = new Set(existingSecurityRecords.map((r) => r.user_id));
    stats.existingRecords = existingUserIds.size;
    logger.info(`Found ${stats.existingRecords} existing security records`);

    // Process users in batches to avoid overwhelming the database
    const batchSize = 100;
    const usersToProcess = allUsers.filter((u) => !existingUserIds.has(u.user_id));

    logger.info(`${usersToProcess.length} users need security records created`);

    if (usersToProcess.length === 0) {
      logger.success('All users already have security records. Nothing to backfill.');
      return stats;
    }

    // Process in batches
    for (let i = 0; i < usersToProcess.length; i += batchSize) {
      const batch = usersToProcess.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(usersToProcess.length / batchSize);

      logger.info(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} users)...`);

      for (const user of batch) {
        try {
          // Create account_security record with HIPAA-compliant defaults
          await db.insert(account_security).values({
            user_id: user.user_id,
            failed_login_attempts: 0,
            last_failed_attempt: null,
            locked_until: null,
            lockout_reason: null,
            max_concurrent_sessions: 3, // Conservative default for HIPAA compliance
            require_fresh_auth_minutes: 5, // Step-up authentication requirement
            password_changed_at: null,
            last_password_reset: null,
            suspicious_activity_detected: false,
          });

          stats.recordsCreated++;

          // Log progress every 50 records
          if (stats.recordsCreated % 50 === 0) {
            logger.info(
              `Progress: ${stats.recordsCreated}/${usersToProcess.length} records created`
            );
          }
        } catch (error) {
          stats.errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Check if it's a unique constraint violation (race condition)
          if (errorMessage.includes('unique') || errorMessage.includes('duplicate')) {
            logger.warn(`Skipping user ${user.user_id} - record already exists (race condition)`);
            stats.existingRecords++;
          } else {
            logger.error(`Failed to create record for user ${user.user_id}:`, {
              error: errorMessage,
            });
            stats.errorDetails.push({
              userId: user.user_id,
              error: errorMessage,
            });
          }
        }
      }

      logger.success(`Batch ${batchNumber}/${totalBatches} completed`);
    }

    // Final summary
    logger.success('Backfill process completed!');
    logger.info('Summary:', {
      totalUsers: stats.totalUsers,
      existingRecords: stats.existingRecords,
      recordsCreated: stats.recordsCreated,
      errors: stats.errors,
      successRate: `${((stats.recordsCreated / Math.max(usersToProcess.length, 1)) * 100).toFixed(2)}%`,
    });

    if (stats.errors > 0) {
      logger.warn(`${stats.errors} errors occurred during backfill:`);
      stats.errorDetails.forEach(({ userId, error }) => {
        logger.error(`  User ${userId}: ${error}`);
      });
    }

    return stats;
  } catch (error) {
    logger.error('Fatal error during backfill:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    // Clean up database connection
    if (client) {
      logger.info('Closing database connection...');
      await client.end();
    }
  }
}

// Run the backfill if this script is executed directly
if (require.main === module) {
  backfillAccountSecurity()
    .then((_stats) => {
      logger.success('Backfill script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Backfill script failed:', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
}

export { backfillAccountSecurity };
