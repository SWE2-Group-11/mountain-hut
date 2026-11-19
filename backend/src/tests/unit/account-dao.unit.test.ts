import { describe, it, expect, vi, beforeEach } from "vitest";
import { db, inTransaction } from "../../database/database";
import { createHikerAccount, getAccountByCredentials, type HikerInput } from "../../dao/account-dao";
import { generatePasswordHash, verifyPassword } from "../../services/password-service";
import { Hiker, Staff } from "../../models/entities/account";

/*
UNIT tests for account-dao.
Covered: getAccountByCredentials (login) and createHikerAccount (self registration).
The "must change password" flag of the accounts created by staff is covered in reserve-for-hiker-dao.unit.test.ts.
The database and the password hashing are mocked.
*/

vi.mock("../../database/database", () => ({
    db: { prepare: vi.fn() },
    inTransaction: vi.fn(),
}));

vi.mock("../../services/password-service", () => ({
    generatePasswordHash: vi.fn(),
    verifyPassword: vi.fn(),
}));

const ACCOUNT_ID = 7;
const EMAIL = "mario@mountainhut.test";
const PASSWORD = "secret";
const SALT = "salt";
const HASH = "a1b2c3d4";

const statement = { get: vi.fn(), run: vi.fn() };

type Write = { table: string; params: unknown[] };
let writes: Write[];
let lastSql: string;
let prepared: string[];

// the row each SELECT returns, by the table it reads (undefined = no row)
let rows: Record<string, unknown>;

const tableOf = (sql: string): string => /INSERT INTO (\w+)/.exec(sql)?.[1] ?? sql;
const readFrom = (sql: string): string => /FROM (\w+)/.exec(sql)?.[1] ?? sql;

const accountRow = (must_change_password = 0) => ({
    id: ACCOUNT_ID, email: EMAIL, password_salt: SALT, password_hash: HASH, must_change_password,
});
const HIKER_ROW = { full_name: "Mario Rossi", mobile_number: "+39 333 123 4567", notes: "Vegetarian", emergency_contact: null };
const STAFF_ROW = { name: "Anna Neri", role: "warden" as const };

const boom = new Error("SQLITE_BUSY: database is locked");

beforeEach(() => {
    vi.resetAllMocks();
    writes = [];
    lastSql = "";
    prepared = [];
    rows = {};
    vi.mocked(db.prepare).mockImplementation(((sql: string) => {
        lastSql = sql;
        prepared.push(sql);
        return statement;
    }) as any);
    vi.mocked(inTransaction).mockImplementation(((callback: () => unknown) => callback()) as any);
    statement.get.mockImplementation(() => rows[readFrom(lastSql)]);
    statement.run.mockImplementation(((...params: unknown[]) => {
        writes.push({ table: tableOf(lastSql), params });
        return { changes: 1, lastInsertRowid: ACCOUNT_ID };
    }) as any);
});

describe("getAccountByCredentials (unit)", () => {
    beforeEach(() => {
        rows = { account: accountRow(), hiker: HIKER_ROW };
        vi.mocked(verifyPassword).mockReturnValue(true);
    });

    it("returns null for an unknown email, without verifying the password", () => {
        // nothing to compare the password with: the login must just fail
        rows.account = undefined;

        expect(getAccountByCredentials(EMAIL, PASSWORD)).toBeNull();
        expect(verifyPassword).not.toHaveBeenCalled();
    });

    it("looks the account up by email", () => {
        getAccountByCredentials(EMAIL, PASSWORD);

        expect(prepared[0]).toMatch(/FROM account WHERE email = \?/);
        expect(statement.get).toHaveBeenNthCalledWith(1, EMAIL);
    });

    it("verifies the password with the salt and hash of the account", () => {
        getAccountByCredentials(EMAIL, PASSWORD);

        expect(verifyPassword).toHaveBeenCalledExactlyOnceWith(PASSWORD, SALT, HASH);
    });

    it("returns null for a wrong password, without reading the profile", () => {
        vi.mocked(verifyPassword).mockReturnValue(false);

        expect(getAccountByCredentials(EMAIL, "wrong")).toBeNull();
        expect(prepared).toHaveLength(1);
    });

    it("returns the hiker with its profile for a hiker account", () => {
        const result = getAccountByCredentials(EMAIL, PASSWORD);

        expect(result).toBeInstanceOf(Hiker);
        expect(result).toEqual(new Hiker(ACCOUNT_ID, EMAIL, SALT, HASH, false,
            HIKER_ROW.full_name, HIKER_ROW.mobile_number, HIKER_ROW.notes, HIKER_ROW.emergency_contact));
        expect(result!.role).toBe("hiker");
    });

    it("reads the hiker profile by account id and does not look for a staff profile", () => {
        getAccountByCredentials(EMAIL, PASSWORD);

        expect(prepared[1]).toMatch(/FROM hiker WHERE account_id = \?/);
        expect(statement.get).toHaveBeenNthCalledWith(2, ACCOUNT_ID);
        expect(prepared.some((sql) => /FROM staff/.test(sql))).toBe(false);
    });

    it.each([
        { stored: 1, expected: true },
        { stored: 0, expected: false },
    ])("maps must_change_password $stored to $expected", ({ stored, expected }) => {
        // SQLite has no boolean: the flag is saved as 0/1
        rows.account = accountRow(stored);

        expect(getAccountByCredentials(EMAIL, PASSWORD)!.must_change_password).toBe(expected);
    });

    it("returns the staff member with its role for a staff account", () => {
        rows.hiker = undefined;
        rows.staff = STAFF_ROW;

        const result = getAccountByCredentials(EMAIL, PASSWORD);

        expect(result).toBeInstanceOf(Staff);
        expect(result).toEqual(new Staff(ACCOUNT_ID, EMAIL, SALT, HASH, false, STAFF_ROW.name, STAFF_ROW.role));
        expect(result!.role).toBe("warden");
        expect(statement.get).toHaveBeenNthCalledWith(3, ACCOUNT_ID);
    });

    it("throws when the account has neither a hiker nor a staff profile", () => {
        // every account must be a hiker or a staff member: a broken row must not log in
        rows.hiker = undefined;

        expect(() => getAccountByCredentials(EMAIL, PASSWORD)).toThrow(`Account ${ACCOUNT_ID} has no hiker or staff profile`);
    });

    it("lets a database failure through instead of swallowing it", () => {
        // a broken database must give an error, not look like "wrong credentials"
        statement.get.mockImplementation(() => {
            throw boom;
        });

        expect(() => getAccountByCredentials(EMAIL, PASSWORD)).toThrow(boom);
    });
});

describe("createHikerAccount: self registration (unit)", () => {
    const INPUT: HikerInput = {
        email: "anna.neri@mountainhut.test",
        password: "anna-password",
        full_name: "Anna Neri",
        mobile_number: "+39 333 444 5555",
        notes: "Arrives late",
        emergency_contact: "Luca Neri +39 333 000 0000",
    };

    beforeEach(() => {
        vi.mocked(generatePasswordHash).mockReturnValue({ salt: SALT, hash: HASH });
    });

    it("returns the new hiker with the id generated by the database", () => {
        const result = createHikerAccount(INPUT);

        expect(result).toBeInstanceOf(Hiker);
        expect(result).toEqual(new Hiker(ACCOUNT_ID, INPUT.email, SALT, HASH, false,
            INPUT.full_name, INPUT.mobile_number, INPUT.notes, INPUT.emergency_contact));
    });

    it("saves the salted hash and never the plain password", () => {
        createHikerAccount(INPUT);

        expect(generatePasswordHash).toHaveBeenCalledExactlyOnceWith(INPUT.password);
        expect(writes[0]).toEqual({ table: "account", params: [INPUT.email, SALT, HASH, 0] });
        expect(writes.flatMap((w) => w.params)).not.toContain(INPUT.password);
    });

    it("saves the account first and then the hiker profile linked to it", () => {
        // hiker.account_id references account.id, so the account must exist first
        createHikerAccount(INPUT);

        expect(writes.map((w) => w.table)).toEqual(["account", "hiker"]);
        expect(writes[1].params[0]).toBe(ACCOUNT_ID);
    });

    it("saves missing notes and emergency contact as null", () => {
        const result = createHikerAccount({ ...INPUT, notes: null, emergency_contact: null })!;

        expect(writes[1].params).toEqual([ACCOUNT_ID, INPUT.full_name, INPUT.mobile_number, null, null]);
        expect(result.notes).toBeNull();
        expect(result.emergency_contact).toBeNull();
    });

    it("converts a bigint row id into a number", () => {
        // better-sqlite3 may return lastInsertRowid as a bigint
        statement.run.mockImplementation(((...params: unknown[]) => {
            writes.push({ table: tableOf(lastSql), params });
            return { changes: 1, lastInsertRowid: BigInt(ACCOUNT_ID) };
        }) as any);

        const result = createHikerAccount(INPUT)!;

        expect(result.id).toBe(ACCOUNT_ID);
        expect(writes[1].params[0]).toBe(ACCOUNT_ID);
    });

    it("returns null and saves nothing when the email is already registered", () => {
        // the email identifies the account: a second one would make the login ambiguous
        rows.account = { 1: 1 };

        expect(createHikerAccount(INPUT)).toBeNull();
        expect(statement.get).toHaveBeenCalledExactlyOnceWith(INPUT.email);
        expect(statement.run).not.toHaveBeenCalled();
    });

    it("checks the email and writes inside the transaction", () => {
        // the transaction never runs its callback: nothing must touch the database
        vi.mocked(inTransaction).mockReturnValue(null);

        createHikerAccount(INPUT);

        expect(inTransaction).toHaveBeenCalledTimes(1);
        expect(db.prepare).not.toHaveBeenCalled();
    });

    it("lets a database failure through instead of swallowing it", () => {
        // the error must reach the transaction, which then undoes the account
        statement.run.mockImplementation(() => {
            throw boom;
        });

        expect(() => createHikerAccount(INPUT)).toThrow(boom);
    });
});