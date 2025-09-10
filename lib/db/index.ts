import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Create the connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}
const client = postgres(connectionString);

// Create the database instance
export const db = drizzle(client, { schema });

// Export schema for use in other files
export * from './schema';
