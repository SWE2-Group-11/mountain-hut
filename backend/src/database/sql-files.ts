import fs from "node:fs";
import path from "node:path";

/** Folders of the SQL files, relative to backend/ (the working directory of the app and of both test runners). */
const SQL_DIRS = {
    schema: path.resolve(process.cwd(), "src/database/sql"),
    fixtures: path.resolve(process.cwd(), "src/tests/fixtures"),
} as const;

/**
 * Reads a SQL file.
 * @param dir "schema" for the app scripts, "fixtures" for the fixed test data.
 * @param file The file name, e.g. "init.sql".
 */
export const readSql = (dir: keyof typeof SQL_DIRS, file: string): string =>
    fs.readFileSync(path.join(SQL_DIRS[dir], file), "utf-8");