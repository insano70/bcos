import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Load environment variables for drizzle-kit (which runs outside Next.js)
config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
