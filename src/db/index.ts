import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';

type DatabaseInstance = ReturnType<typeof drizzle>;

let dbInstance: DatabaseInstance | null = null;

export async function initializeDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = postgres(connectionString, {
    max: 1,
    ssl: 'require',
  });

  const db = drizzle(client, { schema });

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      "telegramId" text PRIMARY KEY,
      "username" text,
      "currentChapter" integer NOT NULL DEFAULT 1,
      "deliveryHour" integer,
      "isPaused" boolean NOT NULL DEFAULT false,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);

  dbInstance = db;
}

export async function getDb(): Promise<DatabaseInstance> {
  if (dbInstance) {
    return dbInstance;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = postgres(connectionString, {
    max: 1,
    ssl: 'require',
  });

  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export { schema };
export * from './schema.js';
