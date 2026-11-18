import Database from "better-sqlite3";
import { SEED_MODE } from "../../config/config";
import { insertSeedAccounts } from "./accounts";
import { insertRandomSlots } from "./slots";
import { insertRandomBookings } from "./bookings";
import { readSql } from "../sql-files";

/**
 * Fills freshly created tables: accounts from the seed accounts file, then slots, tables and bookings,
 * random (SEED_MODE=random) or the fixed test data (SEED_MODE=fixed).
 * @param db The database being seeded, inside the reset transaction.
 */
export const seedDatabase = (db: Database.Database): void => {
    insertSeedAccounts(db);
    if (SEED_MODE === "fixed") {
        db.exec(readSql("fixtures", "seed.sql"));
    } else {
        insertRandomSlots(db);
        insertRandomBookings(db);
    }
};