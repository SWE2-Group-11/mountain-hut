import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, inTransaction } from "../../database/database";
import {
    getAccountByCredentials,
    getAccountById,
    setPasswordHash,
    updatePassword,
} from "../../dao/account-dao";
import { getHikerByEmail } from "../../dao/hiker-dao";
import { consumeResetToken, issueResetToken } from "../../dao/password-reset-dao";
import { generatePasswordHash, verifyPassword } from "../../services/password-service";
import { Hiker, Staff } from "../../models/entities/account";

/*
UNIT tests for the DAO layer of MH-171.
Covered: getAccountById, setPasswordHash, updatePassword, the flag returned by getAccountByCredentials (account-dao),
getHikerByEmail (hiker-dao), issueResetToken and consumeResetToken (password-reset-dao).
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
const EMAIL = "anna.neri@mountainhut.test";
const SALT = "old-salt";
const HASH = "old-hash";
const NEW_PASSWORD = "new-password-123";
const NEW_HASH = { salt: "new-salt", hash: "new-hash" };
const TOKEN_HASH = "a".repeat(64);

const statement = { get: vi.fn(), run: vi.fn() };

type Write = { table: string; sql: string; params: unknown[] };
let writes: Write[];
let lastSql: string;
let prepared: string[];
let changes: number;

// the row each SELECT returns, by the table it reads (undefined = no row)
let rows: Record<string, unknown>;

const tableOf = (sql: string): string => /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/.exec(sql)?.[1] ?? sql;
const readFrom = (sql: string): string => /FROM (\w+)/.exec(sql)?.[1] ?? sql;

const accountRow = (must_change_password = 1) => ({
    id: ACCOUNT_ID, email: EMAIL, password_salt: SALT, password_hash: HASH, must_change_password,
});
const HIKER_ROW = { full_name: "Anna Neri", mobile_number: "+39 333 444 5555", notes: null, emergency_contact: null };
const STAFF_ROW = { name: "Paolo Verdi", role: "employee" as const };

const boom = new Error("SQLITE_BUSY: database is locked");

beforeEach(() => {
    vi.resetAllMocks();
    writes = [];
    lastSql = "";
    prepared = [];
    rows = {};
    changes = 1;
    vi.mocked(db.prepare).mockImplementation(((sql: string) => {
        lastSql = sql;
        prepared.push(sql);
        return statement;
    }) as any);
    vi.mocked(inTransaction).mockImplementation(((callback: () => unknown) => callback()) as any);
    statement.get.mockImplementation(() => rows[readFrom(lastSql)]);
    statement.run.mockImplementation(((...params: unknown[]) => {
        writes.push({ table: tableOf(lastSql), sql: lastSql, params });
        return { changes, lastInsertRowid: ACCOUNT_ID };
    }) as any);
    vi.mocked(generatePasswordHash).mockReturnValue(NEW_HASH);
});

describe("getAccountById (unit)", () => {
    beforeEach(() => {
        rows = { account: accountRow(), hiker: HIKER_ROW };
    });

    it("reads the account by its id and returns the hiker with its profile", () => {
        // Why: the password change starts from the logged-in account id
        const result = getAccountById(ACCOUNT_ID);

        expect(prepared[0]).toMatch(/FROM account WHERE id = \?/);
        expect(statement.get).toHaveBeenNthCalledWith(1, ACCOUNT_ID);
        expect(result).toBeInstanceOf(Hiker);
        expect(result).toEqual(new Hiker(ACCOUNT_ID, EMAIL, SALT, HASH, true,
            HIKER_ROW.full_name, HIKER_ROW.mobile_number, HIKER_ROW.notes, HIKER_ROW.emergency_contact));
    });

    it.each([
        { stored: 1, expected: true },
        { stored: 0, expected: false },
    ])("maps a stored must_change_password $stored to $expected", ({ stored, expected }) => {
        // Why: SQLite keeps the flag as 0/1, the app works with a boolean
        rows.account = accountRow(stored);

        expect(getAccountById(ACCOUNT_ID)!.must_change_password).toBe(expected);
    });

    it("returns the staff member for a staff account", () => {
        rows.hiker = undefined;
        rows.staff = STAFF_ROW;

        const result = getAccountById(ACCOUNT_ID);

        expect(result).toBeInstanceOf(Staff);
        expect(result!.role).toBe("employee");
    });

    it("returns null for an unknown id, without reading a profile", () => {
        rows.account = undefined;

        expect(getAccountById(ACCOUNT_ID)).toBeNull();
        expect(prepared).toHaveLength(1);
    });

    it("lets a database failure through instead of swallowing it", () => {
        statement.get.mockImplementation(() => {
            throw boom;
        });

        expect(() => getAccountById(ACCOUNT_ID)).toThrow(boom);
    });
});

describe("getAccountByCredentials: flag at login (unit)", () => {
    it("returns must_change_password true for an account created by staff", () => {
        // Why: api.md - the login response tells the client that the password must be changed
        rows = { account: accountRow(1), hiker: HIKER_ROW };
        vi.mocked(verifyPassword).mockReturnValue(true);

        const result = getAccountByCredentials(EMAIL, "initial-password");

        expect(verifyPassword).toHaveBeenCalledExactlyOnceWith("initial-password", SALT, HASH);
        expect(result!.must_change_password).toBe(true);
    });
});

describe("setPasswordHash (unit)", () => {
    it("stores the new salt and hash and clears must_change_password for that account", () => {
        // Why: api.md / database.md - any password change clears the flag
        const result = setPasswordHash(ACCOUNT_ID, NEW_HASH);

        const update = writes.find((w) => w.table === "account");
        expect(update?.sql).toMatch(/must_change_password = 0/);
        expect(update?.sql).toMatch(/WHERE id = \?/);
        expect(update?.params).toEqual([NEW_HASH.salt, NEW_HASH.hash, ACCOUNT_ID]);
        expect(result).toBe(true);
    });

    it("deletes every pending reset link of the account", () => {
        // Why: api.md - the change invalidates any pending reset link
        setPasswordHash(ACCOUNT_ID, NEW_HASH);

        const deleted = writes.find((w) => w.table === "password_reset_token");
        expect(deleted?.sql).toMatch(/^DELETE FROM password_reset_token WHERE account_id = \?/);
        expect(deleted?.params).toEqual([ACCOUNT_ID]);
    });

    it("does both writes inside one transaction", () => {
        // Why: a new password with a still valid old reset link must never be saved
        vi.mocked(inTransaction).mockReturnValue(false);

        setPasswordHash(ACCOUNT_ID, NEW_HASH);

        expect(inTransaction).toHaveBeenCalledTimes(1);
        expect(db.prepare).not.toHaveBeenCalled();
    });

    it("returns false when the account does not exist", () => {
        changes = 0;

        expect(setPasswordHash(ACCOUNT_ID, NEW_HASH)).toBe(false);
    });

    it("lets a database failure through instead of swallowing it", () => {
        statement.run.mockImplementation(() => {
            throw boom;
        });

        expect(() => setPasswordHash(ACCOUNT_ID, NEW_HASH)).toThrow(boom);
    });
});

describe("updatePassword (unit)", () => {
    it("hashes the new password and stores only the salt and hash, never the plain text", () => {
        // Why: api.md - passwords are stored as a salted hash, never in plain text
        updatePassword(ACCOUNT_ID, NEW_PASSWORD);

        expect(generatePasswordHash).toHaveBeenCalledExactlyOnceWith(NEW_PASSWORD);
        expect(writes.find((w) => w.table === "account")?.params).toEqual([NEW_HASH.salt, NEW_HASH.hash, ACCOUNT_ID]);
        expect(writes.flatMap((w) => w.params)).not.toContain(NEW_PASSWORD);
    });

    it("clears must_change_password and invalidates the reset links", () => {
        // Why: the first-login change must unblock the account
        updatePassword(ACCOUNT_ID, NEW_PASSWORD);

        expect(writes.find((w) => w.table === "account")?.sql).toMatch(/must_change_password = 0/);
        expect(writes.some((w) => w.table === "password_reset_token")).toBe(true);
    });

    it("returns true when the account exists and false when it does not", () => {
        expect(updatePassword(ACCOUNT_ID, NEW_PASSWORD)).toBe(true);
        changes = 0;
        expect(updatePassword(ACCOUNT_ID, NEW_PASSWORD)).toBe(false);
    });
});

describe("getHikerByEmail (unit)", () => {
    const PROFILE = { id: ACCOUNT_ID, booking_id: null, full_name: "Anna Neri", mobile_number: "+39 333 444 5555", email: EMAIL };

    it("looks the hiker up by the exact email of its account, through the hiker table", () => {
        // Why: api.md - staff accounts never receive the reset email, so only hikers can be found
        rows = { hiker: PROFILE };

        const result = getHikerByEmail(EMAIL);

        expect(prepared[0]).toMatch(/FROM hiker h\s+JOIN account a ON a\.id = h\.account_id/);
        expect(prepared[0]).toMatch(/WHERE a\.email = \?/);
        expect(statement.get).toHaveBeenCalledExactlyOnceWith(EMAIL);
        expect(result).toEqual(PROFILE);
    });

    it("returns null when no hiker has this email", () => {
        expect(getHikerByEmail("nobody@mountainhut.test")).toBeNull();
    });
});

describe("issueResetToken (unit)", () => {
    // 24 hours after the creation, as in docs/database.md; milliseconds must be dropped
    const TOKEN = {
        account_id: ACCOUNT_ID,
        token_hash: TOKEN_HASH,
        created_at: new Date("2026-11-19T09:30:00.123Z"),
        expires_at: new Date("2026-11-20T09:30:00.456Z"),
    };
    const COOLDOWN_START = new Date("2026-11-19T09:25:00.000Z");

    it("stores the hash of the token with the account and the UTC times to the second", () => {
        // Why: database.md - only the hash is stored, times are YYYY-MM-DDTHH:MM:SSZ
        const result = issueResetToken(TOKEN, COOLDOWN_START);

        const insert = writes.find((w) => w.sql.startsWith("INSERT INTO password_reset_token"));
        expect(insert?.params).toEqual([TOKEN_HASH, ACCOUNT_ID, "2026-11-19T09:30:00Z", "2026-11-20T09:30:00Z"]);
        expect(result).toBe(true);
    });

    it("replaces the earlier token of the account, so only the newest link works", () => {
        // Why: api.md - a new link replaces any earlier link
        issueResetToken(TOKEN, COOLDOWN_START);

        const insert = writes.find((w) => w.sql.startsWith("INSERT INTO password_reset_token"));
        expect(insert?.sql).toMatch(/ON CONFLICT \(account_id\) DO UPDATE/);
        expect(insert?.sql).toMatch(/token_hash = excluded\.token_hash/);
        expect(insert?.sql).toMatch(/expires_at = excluded\.expires_at/);
    });

    it("checks for a token of the same account created after the cooldown start", () => {
        // Why: api.md - a new email is sent at most every 5 minutes per account
        issueResetToken(TOKEN, COOLDOWN_START);

        const check = prepared.find((sql) => /^SELECT .* FROM password_reset_token/.test(sql));
        expect(check).toMatch(/account_id = \? AND created_at > \?/);
        expect(statement.get).toHaveBeenCalledExactlyOnceWith(ACCOUNT_ID, "2026-11-19T09:25:00Z");
    });

    it("returns false and stores nothing during the cooldown", () => {
        rows = { password_reset_token: { 1: 1 } };

        expect(issueResetToken(TOKEN, COOLDOWN_START)).toBe(false);
        expect(writes.some((w) => w.sql.startsWith("INSERT"))).toBe(false);
    });

    it("removes the expired tokens on the way", () => {
        // Why: database.md - an expired row is deleted on the next request
        issueResetToken(TOKEN, COOLDOWN_START);

        const cleanup = writes.find((w) => w.sql.startsWith("DELETE FROM password_reset_token"));
        expect(cleanup?.sql).toMatch(/WHERE expires_at <= \?/);
        expect(cleanup?.params).toEqual(["2026-11-19T09:30:00Z"]);
    });

    it("does everything inside one transaction", () => {
        vi.mocked(inTransaction).mockReturnValue(false);

        issueResetToken(TOKEN, COOLDOWN_START);

        expect(inTransaction).toHaveBeenCalledTimes(1);
        expect(db.prepare).not.toHaveBeenCalled();
    });

    it("lets a database failure through instead of swallowing it", () => {
        statement.run.mockImplementation(() => {
            throw boom;
        });

        expect(() => issueResetToken(TOKEN, COOLDOWN_START)).toThrow(boom);
    });
});

describe("consumeResetToken (unit)", () => {
    const NOW = new Date("2026-11-19T10:00:00.789Z");

    it("looks for a token with this hash that has not expired yet", () => {
        // Why: api.md - the link expires after 24 hours
        consumeResetToken(TOKEN_HASH, NEW_HASH, NOW);

        expect(prepared[0]).toMatch(/FROM password_reset_token WHERE token_hash = \? AND expires_at > \?/);
        expect(statement.get).toHaveBeenNthCalledWith(1, TOKEN_HASH, "2026-11-19T10:00:00Z");
    });

    it("returns false and changes no password for an unknown, used or expired token", () => {
        // Why: api.md - such a token gives 400, the password stays the same
        rows = {};

        expect(consumeResetToken(TOKEN_HASH, NEW_HASH, NOW)).toBe(false);
        expect(statement.run).not.toHaveBeenCalled();
    });

    it("sets the new hash and clears must_change_password for the account of the token", () => {
        // Why: api.md - the reset sets a new password and clears must_change_password
        rows = { password_reset_token: { account_id: ACCOUNT_ID } };

        const result = consumeResetToken(TOKEN_HASH, NEW_HASH, NOW);

        const update = writes.find((w) => w.table === "account");
        expect(update?.sql).toMatch(/must_change_password = 0/);
        expect(update?.params).toEqual([NEW_HASH.salt, NEW_HASH.hash, ACCOUNT_ID]);
        expect(result).toBe(true);
    });

    it("deletes the token, so the link works only once", () => {
        // Why: api.md - the link works only once
        rows = { password_reset_token: { account_id: ACCOUNT_ID } };

        consumeResetToken(TOKEN_HASH, NEW_HASH, NOW);

        expect(writes.find((w) => w.table === "password_reset_token")?.params).toEqual([ACCOUNT_ID]);
    });

    it("lets a database failure through instead of swallowing it", () => {
        statement.get.mockImplementation(() => {
            throw boom;
        });

        expect(() => consumeResetToken(TOKEN_HASH, NEW_HASH, NOW)).toThrow(boom);
    });
});
