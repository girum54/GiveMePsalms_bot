import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const client = postgres(connectionString, { max: 1 });
export const db = drizzle(client, { schema });

export { schema };
export * from './schema.js';
