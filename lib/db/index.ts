import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '@/lib/env';

// Get validated database configuration
const dbConfig = {
  url: env.DATABASE_URL,
  // Production optimizations
  ...(env.NODE_ENV === 'production' && {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })
};

// Create the connection with proper configuration
const client = postgres(dbConfig.url, {
  // Production optimizations
  max: dbConfig.max || 10,
  idle_timeout: dbConfig.idleTimeoutMillis || 20000,
  connect_timeout: dbConfig.connectionTimeoutMillis || 5000,
  // Security: Force SSL in production
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  // Prevent connection leaks
  transform: postgres.camel,
});

// Create the database instance
export const db = drizzle(client, { schema });

// Export schema for use in other files
export * from './schema';
