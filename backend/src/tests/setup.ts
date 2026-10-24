import { db } from "../database/database";

// Abort before any test touches the database if it is not the in-memory one
if (db.name !== ":memory:") {
    throw new Error(`Tests must run on an in-memory database, got: ${db.name}`);
}