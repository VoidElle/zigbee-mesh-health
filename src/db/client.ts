import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client';
import { dbFile } from '../config';
import { bootstrapSchema } from './bootstrap';

let db: Database.Database | null = null;
let prisma: PrismaClient | null = null;

// Synchronous bootstrap handle: creates the data dir/schema and sets WAL before
// Prisma's first query. getPrisma() calls it on open; the verification scripts
// use it to seed rows. Kept so better-sqlite3 is imported only from this file.
export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(dbFile());
  db.pragma('journal_mode = WAL');
  bootstrapSchema(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getPrisma(): PrismaClient {
  if (prisma) return prisma;
  // First open: ensure the schema (and WAL) exist before Prisma touches the file.
  getDb();
  const adapter = new PrismaBetterSqlite3({ url: 'file:' + dbFile() });
  prisma = new PrismaClient({ adapter });
  // WAL is a persistent DB property; once is enough. Fire-and-forget: getDb()
  // already set it synchronously, this only keeps the pragma on the Prisma path.
  void prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;').catch((err) => {
    console.error('[db] WAL pragma failed', err);
  });
  return prisma;
}

export async function closePrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
  closeDb();
}
