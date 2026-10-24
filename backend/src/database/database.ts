import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_FILE_PATH } from "../config/config.js";

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
 * Drops, recreates and seeds the whole database in a single transaction.
 * If any step fails, the database is left unchanged.
 */
export const resetDatabase = (): void => {
    const drop = readSql("drop-core.sql");
    const init = readSql("init-core.sql");
    const seed = readSql("seed-core.sql");

    db.transaction(() => {
        db.exec(drop);
        db.exec(init);
        db.exec(seed);
    })();
};

/**
 * Funciton to execute a callback within a database transaction.
 * @param callback The function to execute within the transaction. 
 */
export const inTransaction = <T>(callback: () => T): T => {
    return db.transaction(callback).immediate();
}