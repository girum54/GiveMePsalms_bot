import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

type DatabaseInstance = ReturnType<typeof drizzle>;

let dbInstance: DatabaseInstance | null = null;

export function getDb(): DatabaseInstance {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = postgres(connectionString, { max: 1 });
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export { schema };
export * from './schema.js';
