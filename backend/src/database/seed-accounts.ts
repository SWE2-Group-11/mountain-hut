import Database from "better-sqlite3";
import { z } from "zod";
import { generatePasswordHash } from "../services/password-service";

/*
 * Demo accounts seeded by resetDatabase, read from SEED_ACCOUNT_<n>_<FIELD> environment
 * variables (see .env.example). Numbering starts at 1 and stops at the first missing
 * SEED_ACCOUNT_<n>_EMAIL; account <n> gets id <n>, which seed-core.sql relies on.
 */

const PREFIX = "SEED_ACCOUNT_";

const credentials = {
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1),
    name: z.string().min(1),
};

const SeedAccountSchema = z.discriminatedUnion("role", [
    z.object({ role: z.enum(["warden", "employee"]), ...credentials }),
    z.object({
        role: z.literal("hiker"),
        ...credentials,
        mobile: z.string().min(1),
        notes: z.string().optional(),
        emergency_contact: z.string().optional(),
    }),
]);

type SeedAccount = z.infer<typeof SeedAccountSchema>;
// Distributive over the role union, so `role` still narrows to the hiker fields
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type SeedRow = DistributiveOmit<SeedAccount, "password"> & { id: number; salt: string; hash: string };

const readSeedAccounts = (): SeedAccount[] => {
    const accounts: SeedAccount[] = [];
    for (let n = 1; process.env[`${PREFIX}${n}_EMAIL`] !== undefined; n++) {
        // Empty values count as missing, so optional fields can be left blank
        const field = (name: string) => process.env[`${PREFIX}${n}_${name}`] || undefined;
        const parsed = SeedAccountSchema.safeParse({
            role: field("ROLE"),
            email: field("EMAIL"),
            password: field("PASSWORD"),
            name: field("NAME"),
            mobile: field("MOBILE"),
            notes: field("NOTES"),
            emergency_contact: field("EMERGENCY_CONTACT"),
        });
        if (!parsed.success) {
            throw new Error(`Invalid ${PREFIX}${n}_* environment variables:\n${z.prettifyError(parsed.error)}`);
        }
        accounts.push(parsed.data);
    }
    if (accounts.length === 0) {
        throw new Error(`No seed accounts: set ${PREFIX}1_EMAIL and the other ${PREFIX}<n>_* variables (see .env.example)`);
    }
    return accounts;
};

// Hashed once per process: scrypt is slow and tests reset the database before each test
let seedRows: SeedRow[] | undefined;

const getSeedRows = (): SeedRow[] =>
    seedRows ??= readSeedAccounts().map(({ password, ...account }, index) => ({
        ...account,
        id: index + 1,
        ...generatePasswordHash(password),
    }));

/**
 * Inserts the seed accounts from the environment into freshly created tables.
 * @throws Error if the SEED_ACCOUNT_<n>_* variables are missing or invalid.
 */
export const insertSeedAccounts = (db: Database.Database): void => {
    const insertAccount = db.prepare<[number, string, string, string]>(
        "INSERT INTO account (id, email, password_salt, password_hash) VALUES (?, ?, ?, ?)");
    const insertStaff = db.prepare<[number, string, string]>(
        "INSERT INTO staff (account_id, name, role) VALUES (?, ?, ?)");
    const insertHiker = db.prepare<[number, string, string, string | null, string | null]>(
        "INSERT INTO hiker (account_id, full_name, mobile_number, notes, emergency_contact) VALUES (?, ?, ?, ?, ?)");

    for (const account of getSeedRows()) {
        insertAccount.run(account.id, account.email, account.salt, account.hash);
        if (account.role === "hiker") {
            insertHiker.run(account.id, account.name, account.mobile, account.notes ?? null, account.emergency_contact ?? null);
        } else {
            insertStaff.run(account.id, account.name, account.role);
        }
    }
};
