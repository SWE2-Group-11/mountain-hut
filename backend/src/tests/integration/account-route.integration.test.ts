import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import { LAURA, MARIO, NEW_HIKER, resetTestDatabase } from "../helpers";

const ACCOUNTS_URL = "/api/v1/accounts";
const SESSION_URL = "/api/v1/session";

// Only the mandatory fields, then the full body with the optional ones
const REQUIRED = {
    fullname: "New Hiker",
    mobile_number: "+39 300 000 0000",
    email: NEW_HIKER,
    password: "S3cret-pass",
};
const BODY = {
    ...REQUIRED,
    notes: "Vegetarian",
    emergency_contact: "Anna Hiker, +39 300 111 1111",
};

type HikerRow = { full_name: string; mobile_number: string; notes: string | null; emergency_contact: string | null };

const hikerByEmail = (email: string): HikerRow | undefined =>
    db.prepare<[string], HikerRow>(
        `SELECT h.full_name, h.mobile_number, h.notes, h.emergency_contact
         FROM account a JOIN hiker h ON h.account_id = a.id WHERE a.email = ?`
    ).get(email);
const accountCount = (): number =>
    (db.prepare("SELECT COUNT(*) AS n FROM account").get() as { n: number }).n;

const register = (body: object) => request(app).post(ACCOUNTS_URL).send(body);

beforeEach(() => resetTestDatabase());

describe("POST /api/v1/accounts - successful registration", () => {
    it("returns 201 with the new hiker account and no password data", async () => {
        const res = await register(BODY);

        expect(res.status).toBe(201);
        expect(res.body).toEqual({
            id: expect.any(Number),
            email: NEW_HIKER,
            role: "hiker",
            must_change_password: false,
        });
        expect(hikerByEmail(NEW_HIKER)).toEqual({
            full_name: "New Hiker",
            mobile_number: "+39 300 000 0000",
            notes: "Vegetarian",
            emergency_contact: "Anna Hiker, +39 300 111 1111",
        });
    });

    it("lets the new hiker log in right after registering", async () => {
        const { body: created } = await register(BODY);

        const res = await request(app).post(SESSION_URL).send({ email: NEW_HIKER, password: BODY.password });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ id: created.id, email: NEW_HIKER, role: "hiker" });
    });

    it("stores the optional fields as NULL when they are omitted", async () => {
        const res = await register(REQUIRED);

        expect(res.status).toBe(201);
        expect(hikerByEmail(NEW_HIKER)).toMatchObject({ notes: null, emergency_contact: null });
    });

    it("trims the text fields and stores the email in lowercase", async () => {
        const res = await register({
            ...BODY,
            fullname: "  New Hiker  ",
            mobile_number: " +39 300 000 0000 ",
            email: "  New.Hiker@MountainHut.TEST ",
        });

        expect(res.status).toBe(201);
        expect(res.body.email).toBe(NEW_HIKER);
        expect(hikerByEmail(NEW_HIKER)).toMatchObject({ full_name: "New Hiker", mobile_number: "+39 300 000 0000" });
    });
});

describe("POST /api/v1/accounts - email already registered", () => {
    it.each([
        ["the same email", MARIO],
        ["the same email in another case", "Mario@MountainHut.test"],
    ])("returns 409 for %s and creates nothing", async (_case, email) => {
        const before = accountCount();

        const res = await register({ ...BODY, email });

        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ code: 409, name: "ConflictError" });
        expect(accountCount()).toBe(before);
    });

    it("keeps the existing account usable with its own password", async () => {
        await register({ ...BODY, email: LAURA, password: "another-password" });

        const res = await request(app).post(SESSION_URL).send({ email: LAURA, password: "password" });

        expect(res.status).toBe(201);
    });
});

describe("POST /api/v1/accounts - invalid body", () => {
    it.each([
        ["fullname is missing", { ...REQUIRED, fullname: undefined }],
        ["fullname is only spaces", { ...REQUIRED, fullname: "   " }],
        ["mobile_number is missing", { ...REQUIRED, mobile_number: undefined }],
        ["email is missing", { ...REQUIRED, email: undefined }],
        ["email is not an email", { ...REQUIRED, email: "not-an-email" }],
        ["password is missing", { ...REQUIRED, password: undefined }],
        ["password is empty", { ...REQUIRED, password: "" }],
        ["notes are longer than 200 characters", { ...REQUIRED, notes: "a".repeat(201) }],
        ["emergency_contact is longer than 200 characters", { ...REQUIRED, emergency_contact: "a".repeat(201) }],
    ])("returns 400 when %s and creates nothing", async (_case, body) => {
        const before = accountCount();

        const res = await register(body);

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 400 });
        expect(accountCount()).toBe(before);
    });

    it("accepts notes and emergency_contact of exactly 200 characters", async () => {
        const res = await register({ ...REQUIRED, notes: "a".repeat(200), emergency_contact: "b".repeat(200) });

        expect(res.status).toBe(201);
    });
});
