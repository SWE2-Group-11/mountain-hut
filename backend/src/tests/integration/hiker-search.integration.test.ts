import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import {
    resetTestDatabase, dayFromToday, loginAs, createHikerWithoutBookings,
    MARIO, EMPLOYEE, NEW_HIKER,
} from "../helpers";

/*
 * MH-07 Hiker search - integration tests.
 * Real HTTP/session middleware, query validation, controller and SQL.
 * The seed contains registered hikers Mario/Laura and temporary guest Paolo.
 * Additional fixtures use the same helpers as the other integration tests.
 */
const ACCOUNTS_URL = "/api/v1/accounts";
const RESERVATIONS_URL = "/api/v1/reservations";
const WARDEN = "warden@mountainhut.test";

type Match = {
    id: number | null; bookingId: number | null; fullname: string;
    mobile_number: string | null; email: string | null; hasAccount: boolean;
};

beforeEach(() => resetTestDatabase());

describe("Hiker search - integration", () => {
    describe("access", () => {
        it("answers 401 for a visitor", async () => {
            const res = await request(app).get(ACCOUNTS_URL).query({ name: "Mario" });

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401, name: "UnauthorizedError" });
        });

        it("answers 403 for a hiker", async () => {
            const hiker = await loginAs(MARIO);

            const res = await hiker.get(ACCOUNTS_URL).query({ name: "Mario" });

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 403, name: "ForbiddenError" });
        });

        it.each([
            { role: "employee", email: EMPLOYEE },
            { role: "warden", email: WARDEN },
        ])("lets the $role search hikers", async ({ email }) => {
            const staff = await loginAs(email);

            const res = await staff.get(ACCOUNTS_URL).query({ email: MARIO });

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0]).toMatchObject({ email: MARIO, hasAccount: true, bookingId: null });
        });
    });

    describe("matching and response", () => {
        it.each([
            { label: "partial name with spaces and mixed case", query: { name: " rOsS " } },
            { label: "partial phone with spaces ignored", query: { phone: "333123" } },
            { label: "trimmed case-insensitive email", query: { email: ` ${MARIO.toUpperCase()} ` } },
            { label: "all criteria together", query: { name: "Mario", phone: "333123", email: MARIO } },
        ])("finds a registered hiker by $label", async ({ query }) => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query(query);

            expect(res.status).toBe(200);
            const account = db.prepare("SELECT id FROM account WHERE email = ?").get(MARIO) as { id: number };
            expect(res.body).toEqual([{
                id: account.id, bookingId: null, fullname: "Mario Rossi",
                mobile_number: "+39 333 123 4567", email: MARIO, hasAccount: true,
            }]);
        });

        it("combines criteria with AND rather than OR", async () => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query({ email: MARIO, name: "Laura" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("does not match only part of an email address", async () => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query({ email: "ario@mountainhut.test" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("returns a temporary guest with its booking id and no account", async () => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query({ name: "paolo", phone: "340111" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([{
                id: null, bookingId: 4, fullname: "Paolo Verdi",
                mobile_number: "+39 340 111 2233", email: null, hasAccount: false,
            }]);
        });

        it("includes registered and temporary hikers in the same name search", async () => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query({ name: "o" });

            expect(res.status).toBe(200);
            const matches: Match[] = res.body;
            expect(matches.some((match) => match.email === MARIO && match.hasAccount)).toBe(true);
            expect(matches.some((match) => match.fullname === "Paolo Verdi" && !match.hasAccount)).toBe(true);
        });

        it.each([EMPLOYEE, WARDEN])("never returns the staff account %s", async (email) => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query({ email });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("returns an empty list when nobody matches", async () => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query({ name: "NobodyMatchesThisName" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it.each(["%", "_"])("treats the LIKE wildcard %s as a literal character", async (name) => {
            createHikerWithoutBookings();
            db.prepare("UPDATE hiker SET full_name = ? WHERE account_id = (SELECT id FROM account WHERE email = ?)").run("Trail %_ Guest", NEW_HIKER);
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query({ name });

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0]).toMatchObject({ fullname: "Trail %_ Guest", email: NEW_HIKER });
        });

        it("returns at most 50 matches ordered by full name", async () => {
            // Insert in reverse order so the assertion verifies the SQL ORDER BY.
            for (let i = 54; i >= 0; i--) {
                const email = `search.${i}@mountainhut.test`;
                createHikerWithoutBookings(email);
                db.prepare("UPDATE hiker SET full_name = ? WHERE account_id = (SELECT id FROM account WHERE email = ?)")
                    .run(`Search Hiker ${String(i).padStart(2, "0")}`, email);
            }
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query({ name: "Search Hiker" });

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(50);
            expect(res.body.map((match: Match) => match.fullname)).toEqual(Array.from({ length: 50 }, (_, i) => `Search Hiker ${String(i).padStart(2, "0")}`));
        });
    });

    describe("validation", () => {
        it.each([
            { label: "missing criteria", query: {} },
            { label: "blank name", query: { name: "   " } },
            { label: "blank phone", query: { phone: "" } },
            { label: "invalid email", query: { email: "not-an-email" } },
            { label: "unknown parameter", query: { name: "Mario", role: "hiker" } },
        ])("answers 400 for $label", async ({ query }) => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.get(ACCOUNTS_URL).query(query);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: "BadRequestError", message: expect.any(String) });
        });
    });

    describe("reservation and search together", () => {
        it("finds a temporary guest created through a staff reservation", async () => {
            const staff = await loginAs(EMPLOYEE);
            const created = await staff.post(RESERVATIONS_URL).send({
                date: dayFromToday(1), slot: "13:00", partySize: 2,
                hiker: { mode: "temporary", fullname: "Paolo Integration", mobile_number: "+39 333 7654321" },
            });
            expect(created.status).toBe(201);

            const found = await staff.get(ACCOUNTS_URL).query({ name: "INTEGRATION", phone: "333765" });

            expect(found.status).toBe(200);
            expect(found.body).toEqual([{
                id: null, bookingId: created.body.id, fullname: "Paolo Integration",
                mobile_number: "+39 333 7654321", email: null, hasAccount: false,
            }]);
        });

        it("finds a new registered hiker using the account created by the reservation", async () => {
            const staff = await loginAs(EMPLOYEE);
            const email = "search.new@mountainhut.test";
            const created = await staff.post(RESERVATIONS_URL).send({
                date: dayFromToday(1), slot: "13:00", partySize: 2,
                hiker: { mode: "registered", fullname: "Anna Integration", mobile_number: "+39 333 7654321", email },
            });
            expect(created.status).toBe(201);

            const found = await staff.get(ACCOUNTS_URL).query({ email });

            expect(found.status).toBe(200);
            expect(found.body).toEqual([{
                id: created.body.hikerId, bookingId: null, fullname: "Anna Integration",
                mobile_number: "+39 333 7654321", email, hasAccount: true,
            }]);
        });
    });
});
