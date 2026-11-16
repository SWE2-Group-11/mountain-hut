import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_FILE_PATH } from "../config/config.js";
import { insertSeedAccounts } from "./seed-accounts.js";

const SQL_DIR = path.resolve(process.cwd(), "src/database/sql");

function openDatabase(): Database.Database {
  try {
    const connection = new Database(DB_FILE_PATH);
    connection.pragma("journal_mode = WAL");

    // Explicitly enable foreign key support for this connection
    connection.pragma("foreign_keys = ON");

    console.log("Database connected successfully");
    return connection;
  } catch (err) {
    console.error("Error opening the database: ", (err as Error).message);
    throw err;
  }
}

export const db = openDatabase();

/**
 * Reads a SQL script from the database/sql folder.
 */
export const readSql = (file: string): string =>
    fs.readFileSync(path.join(SQL_DIR, file), "utf-8");

/**
 * Tells whether the database has no schema yet: a new file, or one whose first
 * reset failed and was rolled back (the file exists but has no tables).
 */
export const isDatabaseEmpty = (): boolean =>
    !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'account'").get();

/**
 * Drops, recreates and seeds the whole database in a single transaction:
 * accounts from the seed accounts JSON file, then seed-core.sql.
 * If any step fails, the database is left unchanged.
 */
export const resetDatabase = (): void => {
    const drop = readSql("drop-core.sql");
    const init = readSql("init-core.sql");
    const seed = readSql("seed-core.sql");

    db.transaction(() => {
        db.exec(drop);
        db.exec(init);
        insertSeedAccounts(db);
        try {
            db.exec(seed);
        } catch (err) {
            // seed-core.sql never changes at runtime: a broken reference can only come from the
            // accounts file, whose bookings need hikers at positions 3 and 4
            if (err instanceof Database.SqliteError && err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
                throw new Error(`${err.message}: the demo bookings in seed-core.sql belong to the 3rd and 4th `
                    + "accounts in the seed accounts file, so the file must contain at least 4 accounts and "
                    + "those two must have role \"hiker\". Fix the file and restart: seeding is retried automatically.");
            }
            throw err;
        }
    })();
};

/**
 * Funciton to execute a callback within a database transaction.
 * @param callback The function to execute within the transaction. 
 */
export const inTransaction = <T>(callback: () => T): T => {
    return db.transaction(callback).immediate();
}