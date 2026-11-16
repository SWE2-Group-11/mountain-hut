import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import { generatePasswordHash } from "../services/password-service";

/*
 * Demo accounts seeded by resetDatabase, read from a JSON file (see seed-accounts.example.json):
 * seed-accounts.json in the repository root, or the file in SEED_ACCOUNTS_FILE
 * (the Docker image sets it to the mounted secret, the tests to their own file).
 * The account at position <n> (from 1) gets id <n>, which seed-core.sql relies on.
 */

const SEED_ACCOUNTS_FILE = process.env.SEED_ACCOUNTS_FILE ?? path.resolve(process.cwd(), "../seed-accounts.json");

const credentials = {
    email: z.string().trim().toLowerCase().pipe(z.email()),
    password: z.string().min(1),
    name: z.string().min(1),
};

const SeedAccountsSchema = z.array(z.discriminatedUnion("role", [
    z.object({ role: z.enum(["warden", "employee"]), ...credentials }).strict(),
    z.object({
        role: z.literal("hiker"),
        ...credentials,
        mobile: z.string().min(1),
        notes: z.string().nullish(),
        emergency_contact: z.string().nullish(),
    }).strict(),
])).min(1);

type SeedAccount = z.infer<typeof SeedAccountsSchema>[number];
// Distributive over the role union, so `role` still narrows to the hiker fields
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type SeedRow = DistributiveOmit<SeedAccount, "password"> & { id: number; salt: string; hash: string };

const readSeedAccounts = (): SeedAccount[] => {
    let json: unknown;
    try {
        json = JSON.parse(fs.readFileSync(SEED_ACCOUNTS_FILE, "utf-8"));
    } catch (err) {
        // A directory here usually means Docker created it because the host file was missing
        throw new Error(`Cannot read the seed accounts file ${SEED_ACCOUNTS_FILE} `
            + `(copy seed-accounts.example.json to seed-accounts.json): ${(err as Error).message}`);
    }
    const parsed = SeedAccountsSchema.safeParse(json);
    if (!parsed.success) {
        throw new Error(`Invalid seed accounts file ${SEED_ACCOUNTS_FILE}:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
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
 * Inserts the seed accounts from the JSON file into freshly created tables.
 * @throws Error if the file is missing or invalid.
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
