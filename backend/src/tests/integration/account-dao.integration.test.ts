import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../database/database";
import { createHikerAccount, getAccountByCredentials, HikerInput } from "../../dao/account-dao";
import { Hiker } from "../../models/entities/account";
import { MARIO, NEW_HIKER, resetTestDatabase } from "../helpers";

// Integration tests of the account DAO

const INPUT: HikerInput = {
    email: NEW_HIKER,
    password: "S3cret-pass",
    full_name: "New Hiker",
    mobile_number: "+39 300 000 0000",
    notes: "Vegetarian",
    emergency_contact: "Anna Hiker, +39 300 111 1111",
};

type AccountRow = { id: number; email: string; password_salt: string; password_hash: string; must_change_password: number };
type HikerRow = { account_id: number; full_name: string; mobile_number: string; notes: string | null; emergency_contact: string | null };

const accountRow = (email: string): AccountRow | undefined =>
    db.prepare<[string], AccountRow>(
        "SELECT id, email, password_salt, password_hash, must_change_password FROM account WHERE email = ?"
    ).get(email);
const hikerRow = (accountId: number): HikerRow | undefined =>
    db.prepare<[number], HikerRow>(
        "SELECT account_id, full_name, mobile_number, notes, emergency_contact FROM hiker WHERE account_id = ?"
    ).get(accountId);
const count = (table: "account" | "hiker"): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeEach(() => resetTestDatabase());

describe("createHikerAccount - registering a hiker", () => {
    it("inserts the account and its hiker profile and returns the created hiker", () => {
        const hiker = createHikerAccount(INPUT);

        expect(hiker).toBeInstanceOf(Hiker);
        expect(hiker).toMatchObject({
            email: NEW_HIKER,
            role: "hiker",
            must_change_password: false,
            full_name: "New Hiker",
            mobile_number: "+39 300 000 0000",
            notes: "Vegetarian",
            emergency_contact: "Anna Hiker, +39 300 111 1111",
        });

        const account = accountRow(NEW_HIKER);
        expect(account?.id).toBe(hiker?.id);
        expect(account?.must_change_password).toBe(0);
        expect(hikerRow(hiker!.id)).toEqual({
            account_id: hiker!.id,
            full_name: "New Hiker",
            mobile_number: "+39 300 000 0000",
            notes: "Vegetarian",
            emergency_contact: "Anna Hiker, +39 300 111 1111",
        });
    });

    it("stores the optional fields as NULL when they are not given", () => {
        const hiker = createHikerAccount({ ...INPUT, notes: null, emergency_contact: null });

        expect(hikerRow(hiker!.id)).toMatchObject({ notes: null, emergency_contact: null });
    });

    it("stores must_change_password when it is requested", () => {
        createHikerAccount({ ...INPUT, must_change_password: true });

        expect(accountRow(NEW_HIKER)?.must_change_password).toBe(1);
    });

    it("never stores the password in clear and uses a different salt for every account", () => {
        const first = createHikerAccount(INPUT)!;
        const second = createHikerAccount({ ...INPUT, email: "second.hiker@mountainhut.test" })!;

        const firstRow = accountRow(first.email)!;
        const secondRow = accountRow(second.email)!;
        expect(firstRow.password_hash).not.toContain(INPUT.password);
        expect(firstRow.password_salt).not.toBe(secondRow.password_salt);
        expect(firstRow.password_hash).not.toBe(secondRow.password_hash); // same password, different salt
    });

    it("creates an account that can log in with its password and not with another one", () => {
        const created = createHikerAccount(INPUT)!;

        const loggedIn = getAccountByCredentials(NEW_HIKER, INPUT.password);
        expect(loggedIn).toBeInstanceOf(Hiker);
        expect(loggedIn).toMatchObject({ id: created.id, role: "hiker", full_name: "New Hiker" });
        expect(getAccountByCredentials(NEW_HIKER, "wrong-password")).toBeNull();
    });

    it("returns null for an email that is already registered and leaves the database as it was", () => {
        const accountsBefore = count("account");
        const hikersBefore = count("hiker");
        const marioBefore = accountRow(MARIO);

        expect(createHikerAccount({ ...INPUT, email: MARIO })).toBeNull();

        expect(count("account")).toBe(accountsBefore);
        expect(count("hiker")).toBe(hikersBefore);
        expect(accountRow(MARIO)).toEqual(marioBefore); // the existing password is not overwritten
    });

    it("saves nothing at all when the hiker profile is rejected by the database", () => {
        const accountsBefore = count("account");

        // full_name is NOT NULL: the second insert fails after the account row was written
        expect(() => createHikerAccount({ ...INPUT, full_name: null as unknown as string })).toThrow();

        expect(accountRow(NEW_HIKER)).toBeUndefined(); // the account row was rolled back, not left without a profile
        expect(count("account")).toBe(accountsBefore);
    });
});
