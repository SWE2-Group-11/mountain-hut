import Database from "better-sqlite3";
import { DB_FILE_PATH } from "../config/config.js";
import { seedDatabase } from "./seed/index.js";
import { readSql } from "./sql-files.js";

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
 * Tells whether the database has no schema yet: a new file, or one whose first
 * reset failed and was rolled back (the file exists but has no tables).
 */
export const isDatabaseEmpty = (): boolean =>
    !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'account'").get();

/**
 * Drops, recreates and seeds the whole database in a single transaction (see seed/index.ts).
 * If any step fails, the database is left unchanged.
 */
export const resetDatabase = (): void => {
    const drop = readSql("schema", "drop.sql");
    const init = readSql("schema", "init.sql");

    db.transaction(() => {
        db.exec(drop);
        db.exec(init);
        seedDatabase(db);
    })();
};

/**
 * Funciton to execute a callback within a database transaction.
 * @param callback The function to execute within the transaction. 
 */
export const inTransaction = <T>(callback: () => T): T => {
    return db.transaction(callback).immediate();
}