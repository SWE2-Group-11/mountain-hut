import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import { CLIENT_ORIGIN } from "../../config/config";
import type { MailMessage } from "../../notifications/mail-sender";
import { resetTestDatabase, dayFromToday, loginAs, MARIO, EMPLOYEE } from "../helpers";

/*
 * MH-171 First login after employee registration (backend MH-172) - integration tests.
 * Requirement (MH-07 clarification): an account created by staff gets a random password, told to
 * the hiker; the hiker must change it at the next login and can always recover it by email; reset
 * links expire after 24 hours. Contract: docs/api.md (PUT /accounts/current/password,
 * POST /accounts/password-reset, POST /accounts/password-reset/confirm, POST /reservations in
 * "registered" mode) and docs/database.md (password_reset_token).
 *
 * Everything is real (HTTP app, sessions, validation, controllers, DAOs, SQLite in memory, email
 * template) except the SMTP transport: createNodemailerSender returns an in-memory inbox, as in
 * booking-confirmation-email.integration.test.ts. The reset token is read from the emailed link.
 */
const mail = vi.hoisted(() => ({
    inbox: [] as MailMessage[],
    send: vi.fn(),
}));

vi.mock("../../notifications/mail-sender", () => ({
    createNodemailerSender: () => ({ send: mail.send }),
}));

const SESSION_URL = "/api/v1/session";
const CURRENT_SESSION_URL = "/api/v1/session/current";
const ACCOUNTS_URL = "/api/v1/accounts";
const PASSWORD_URL = "/api/v1/accounts/current/password";
const RESET_URL = "/api/v1/accounts/password-reset";
const CONFIRM_URL = "/api/v1/accounts/password-reset/confirm";
const RESERVATIONS_URL = "/api/v1/reservations";
const SLOTS_URL = "/api/v1/slots";

const WARDEN = "warden@mountainhut.test";
const ANNA = "anna.first@mountainhut.test";
const RESET_SUBJECT = "Reset your Mountain Hut password";
const NEW_PASSWORD = "my own secret 42";
const OTHER_PASSWORD = "another secret 43";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Computed once: tests that fake the clock would otherwise shift it
const tomorrow = dayFromToday(1);

type StaffHiker = { id: number; email: string; initialPassword: string; bookingId: number };

/** The employee books tomorrow 13:00 in "registered" mode: creates the account and returns the initial password. */
const createHikerByStaff = async (email = ANNA, fullname = "Anna First"): Promise<StaffHiker> => {
    const employee = await loginAs(EMPLOYEE);
    const res = await employee.post(RESERVATIONS_URL).send({
        date: tomorrow,
        slot: "13:00",
        partySize: 2,
        hiker: { mode: "registered", fullname, mobile_number: "+39 333 1112222", email },
    });
    if (res.status !== 201) {
        throw new Error(`Staff booking failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return { id: res.body.hikerId, email, initialPassword: res.body.initialPassword, bookingId: res.body.id };
};

/** A new session logged in with any password; returns the agent and the login response. */
const login = async (email: string, password: string) => {
    const agent = request.agent(app);
    const res = await agent.post(SESSION_URL).send({ email, password });
    return { agent, res };
};

const loggedIn = async (email: string, password: string) => {
    const { agent, res } = await login(email, password);
    if (res.status !== 201) {
        throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return agent;
};

const accountRow = (id: number) =>
    db.prepare<[number], { password_salt: string; password_hash: string; must_change_password: number }>(
        "SELECT password_salt, password_hash, must_change_password FROM account WHERE id = ?"
    ).get(id)!;

type TokenRow = { token_hash: string; account_id: number; created_at: string; expires_at: string };
const tokenRows = () => db.prepare<[], TokenRow>("SELECT * FROM password_reset_token ORDER BY account_id").all();

const resetEmailsTo = (email: string) => mail.inbox.filter((m) => m.to === email && m.subject === RESET_SUBJECT);

/** The email is sent in the background after the 202: wait for the n-th reset email to that address. */
const waitForResetEmails = (email: string, count: number) =>
    vi.waitFor(() => expect(resetEmailsTo(email)).toHaveLength(count));

/**
 * Lets the background email work of the requests already answered finish, so "no email" can be
 * asserted on the inbox. The reset email starts on setImmediate and the fake sender stores it at
 * once: a few real setImmediate turns (only Date is ever faked) run it and the promise callbacks after it.
 */
const BACKGROUND_FLUSH_TURNS = 5;
const flushBackgroundEmails = async () => {
    for (let turn = 0; turn < BACKGROUND_FLUSH_TURNS; turn++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
};

const tokenFrom = (message: MailMessage): string => {
    const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(message.text);
    if (!match) {
        throw new Error(`No reset link in the email: ${message.text}`);
    }
    return match[1];
};

/** Asks for a reset email for `email` and returns the token of the link it receives. */
const requestToken = async (email: string): Promise<string> => {
    const before = resetEmailsTo(email).length;
    expect((await request(app).post(RESET_URL).send({ email })).status).toBe(202);
    await waitForResetEmails(email, before + 1);
    return tokenFrom(resetEmailsTo(email)[before]);
};

const confirm = (token: string, new_password: string) =>
    request(app).post(CONFIRM_URL).send({ token, new_password });

/** Fakes only Date (setImmediate and the waits stay real), starting on a whole second. */
const freezeClock = (): number => {
    const start = Math.floor(Date.now() / 1000) * 1000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    return start;
};

describe("First login after employee registration - integration", () => {
    beforeEach(() => {
        resetTestDatabase();
        mail.inbox.length = 0;
        mail.send.mockReset();
        mail.send.mockImplementation(async (message: MailMessage) => {
            mail.inbox.push(message);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("forced change after a staff registration", () => {
        it("a hiker created by staff logs in with the initial password and is told to change it", async () => {
            // PO: the password is randomly generated and must be changed at the next login
            const anna = await createHikerByStaff();
            const other = await createHikerByStaff("other.first@mountainhut.test", "Other First");

            const { res } = await login(ANNA, anna.initialPassword);

            expect(res.status).toBe(201);
            expect(res.body).toEqual({ id: anna.id, email: ANNA, role: "hiker", must_change_password: true });
            expect(typeof anna.initialPassword).toBe("string");
            expect(anna.initialPassword).not.toBe("");
            expect(anna.initialPassword).not.toBe(other.initialPassword);
        });

        it("until the change, every hiker route answers 403 Password change required and changes nothing", async () => {
            // api.md: every other route that requires authentication answers 403 until the change
            const anna = await createHikerByStaff();
            const hiker = await loggedIn(ANNA, anna.initialPassword);
            const before = {
                bookings: db.prepare("SELECT * FROM booking ORDER BY id").all(),
                seats: db.prepare("SELECT * FROM seated_at ORDER BY booking_id, table_number").all(),
            };

            const responses = [
                await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "19:30", partySize: 1 }),
                await hiker.get(RESERVATIONS_URL),
                await hiker.patch(`${RESERVATIONS_URL}/${anna.bookingId}`).send({ partySize: 3 }),
                await hiker.delete(`${RESERVATIONS_URL}/${anna.bookingId}`),
            ];

            for (const res of responses) {
                expect(res.status).toBe(403);
                expect(res.body).toMatchObject({ code: 403, message: "Password change required" });
            }
            expect({
                bookings: db.prepare("SELECT * FROM booking ORDER BY id").all(),
                seats: db.prepare("SELECT * FROM seated_at ORDER BY booking_id, table_number").all(),
            }).toEqual(before);
        });

        it("until the change, staff-only routes are refused too", async () => {
            // api.md: every other route that requires authentication answers 403 (status only, agreed in MH-174)
            const anna = await createHikerByStaff();
            const hiker = await loggedIn(ANNA, anna.initialPassword);

            const responses = [
                await hiker.get(ACCOUNTS_URL).query({ name: "Mario" }),
                await hiker.get(`${SLOTS_URL}/configurations`),
                await hiker.post(SLOTS_URL).send({}),
                await hiker.post(`${SLOTS_URL}/copy-week`).send({}),
            ];

            for (const res of responses) {
                expect(res.status).toBe(403);
            }
        });

        it("until the change, public routes and logout still work", async () => {
            // api.md: only routes that require authentication are blocked; GET /slots does not
            const anna = await createHikerByStaff();
            const hiker = await loggedIn(ANNA, anna.initialPassword);

            expect((await hiker.get(SLOTS_URL).query({ date: tomorrow })).status).toBe(200);
            expect((await hiker.delete(CURRENT_SESSION_URL)).status).toBe(204);
            expect((await hiker.get(CURRENT_SESSION_URL)).status).toBe(401);
        });

        it("a wrong current password is refused and the hiker stays blocked", async () => {
            // api.md: 401 if current_password is wrong
            const anna = await createHikerByStaff();
            const hiker = await loggedIn(ANNA, anna.initialPassword);

            const res = await hiker.put(PASSWORD_URL).send({ current_password: "not the one", new_password: NEW_PASSWORD });

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401 });
            expect((await hiker.get(RESERVATIONS_URL)).status).toBe(403);
            expect((await login(ANNA, anna.initialPassword)).res.status).toBe(201);
        });

        it("an invalid new password is refused and the hiker stays blocked", async () => {
            // api.md: new_password 8 to 128 characters and different from current_password, else 400
            const anna = await createHikerByStaff();
            const hiker = await loggedIn(ANNA, anna.initialPassword);
            const current_password = anna.initialPassword;

            const bodies = [
                { current_password, new_password: "1234567" },
                { current_password, new_password: "x".repeat(129) },
                { current_password, new_password: current_password },
                { current_password },
                { new_password: NEW_PASSWORD },
            ];
            for (const body of bodies) {
                expect((await hiker.put(PASSWORD_URL).send(body)).status).toBe(400);
            }
            expect((await request(app).put(PASSWORD_URL).send({ current_password, new_password: NEW_PASSWORD })).status).toBe(401);

            expect(accountRow(anna.id).must_change_password).toBe(1);
            expect((await hiker.get(RESERVATIONS_URL)).status).toBe(403);
        });

        it("after the change the same session can book right away", async () => {
            // PO + api.md: the change clears the flag, also in the current session
            const anna = await createHikerByStaff();
            const hiker = await loggedIn(ANNA, anna.initialPassword);

            const res = await hiker.put(PASSWORD_URL).send({ current_password: anna.initialPassword, new_password: NEW_PASSWORD });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ id: anna.id, email: ANNA, role: "hiker", must_change_password: false });
            const session = await hiker.get(CURRENT_SESSION_URL);
            expect(session.status).toBe(200);
            expect(session.body.must_change_password).toBe(false);
            const bookings = await hiker.get(RESERVATIONS_URL);
            expect(bookings.status).toBe(200);
            expect(bookings.body.map((b: { id: number }) => b.id)).toContain(anna.bookingId);
            const booked = await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "19:30", partySize: 1 });
            expect(booked.status).toBe(201);
        });

        it("after the change the initial password no longer works and the new one does", async () => {
            // PO: the hiker replaces the password; database.md: the flag is cleared, only a salted hash is stored
            const anna = await createHikerByStaff();
            const before = accountRow(anna.id);
            const hiker = await loggedIn(ANNA, anna.initialPassword);
            expect((await hiker.put(PASSWORD_URL).send({ current_password: anna.initialPassword, new_password: NEW_PASSWORD })).status).toBe(200);

            expect((await login(ANNA, anna.initialPassword)).res.status).toBe(401);
            const fresh = await login(ANNA, NEW_PASSWORD);
            expect(fresh.res.status).toBe(201);
            expect(fresh.res.body.must_change_password).toBe(false);

            const after = accountRow(anna.id);
            expect(after.must_change_password).toBe(0);
            expect(after.password_salt).not.toBe(before.password_salt);
            expect(after.password_hash).not.toBe(before.password_hash);
            expect(after.password_hash).not.toContain(NEW_PASSWORD);
        });

        it("a password change cancels a pending reset link", async () => {
            // api.md: the change invalidates any pending reset link; database.md: the token row is deleted
            const anna = await createHikerByStaff();
            const token = await requestToken(ANNA);
            const hiker = await loggedIn(ANNA, anna.initialPassword);
            expect((await hiker.put(PASSWORD_URL).send({ current_password: anna.initialPassword, new_password: NEW_PASSWORD })).status).toBe(200);

            expect((await confirm(token, OTHER_PASSWORD)).status).toBe(400);
            expect(tokenRows().filter((t) => t.account_id === anna.id)).toEqual([]);
            expect((await login(ANNA, NEW_PASSWORD)).res.status).toBe(201);
        });

        it("a self-registered hiker is never blocked", async () => {
            // api.md: POST /accounts returns must_change_password always false
            const email = "self.registered@mountainhut.test";
            const registered = await request(app).post(ACCOUNTS_URL).send({
                fullname: "Self Registered", mobile_number: "+39 333 0001111", email, password: NEW_PASSWORD,
            });
            expect(registered.status).toBe(201);
            expect(registered.body.must_change_password).toBe(false);

            const { agent, res } = await login(email, NEW_PASSWORD);
            expect(res.status).toBe(201);
            expect(res.body.must_change_password).toBe(false);
            expect((await agent.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "19:30", partySize: 1 })).status).toBe(201);

            const mario = await login(MARIO, "password");
            expect(mario.res.body.must_change_password).toBe(false);
            expect((await mario.agent.get(RESERVATIONS_URL)).status).toBe(200);
        });
    });

    describe("reset email request", () => {
        it("a hiker created by staff can ask for a reset email before ever logging in", async () => {
            // PO: in any case the hiker can recover the password via email; api.md: link to <CLIENT_ORIGIN>/reset-password?token=
            await createHikerByStaff();

            const res = await request(app).post(RESET_URL).send({ email: ANNA });

            expect(res.status).toBe(202);
            expect(res.text).toBe("");
            await waitForResetEmails(ANNA, 1);
            const [email] = resetEmailsTo(ANNA);
            expect(email.text).toMatch(new RegExp(`${CLIENT_ORIGIN}/reset-password\\?token=[A-Za-z0-9_-]+`));
            expect(email.html).toContain(`${CLIENT_ORIGIN}/reset-password?token=${tokenFrom(email)}`);
            expect(email.text).toMatch(/24 hours/);
        });

        it("the request answers the same for an unknown address, a staff address and a hiker", async () => {
            // api.md: 202 always, so the endpoint does not reveal which addresses have an account; staff never get the email
            await createHikerByStaff();
            const answers = [];
            for (const email of ["nobody@mountainhut.test", EMPLOYEE, WARDEN, ANNA]) {
                const res = await request(app).post(RESET_URL).send({ email });
                answers.push({
                    status: res.status,
                    text: res.text,
                    type: res.headers["content-type"],
                    length: res.headers["content-length"],
                });
            }

            expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
            expect(answers[0].status).toBe(202);
            await waitForResetEmails(ANNA, 1);
            await flushBackgroundEmails();
            expect(mail.inbox.map((m) => m.to)).toEqual([ANNA]);
            const staffIds = db.prepare<[], { account_id: number }>("SELECT account_id FROM staff").all().map((s) => s.account_id);
            expect(tokenRows().filter((t) => staffIds.includes(t.account_id))).toEqual([]);
        });

        it("the email address is case-insensitive", async () => {
            // api.md: email is case-insensitive
            await createHikerByStaff();

            expect((await request(app).post(RESET_URL).send({ email: "  ANNA.First@MountainHut.TEST " })).status).toBe(202);

            await waitForResetEmails(ANNA, 1);
        });

        it("a missing or invalid email is refused", async () => {
            // api.md: 400 for a missing or invalid email
            expect((await request(app).post(RESET_URL).send({})).status).toBe(400);
            expect((await request(app).post(RESET_URL).send({ email: "not-an-email" })).status).toBe(400);
        });

        it("a second request within 5 minutes sends no new email and keeps the first link", async () => {
            // api.md: a new email is sent at most every 5 minutes per account
            const start = freezeClock();
            await createHikerByStaff();
            const token = await requestToken(ANNA);

            vi.setSystemTime(start + 5 * MINUTE - 1000);
            expect((await request(app).post(RESET_URL).send({ email: ANNA })).status).toBe(202);

            await flushBackgroundEmails();
            expect(resetEmailsTo(ANNA)).toHaveLength(1);
            expect((await confirm(token, NEW_PASSWORD)).status).toBe(204);
        });

        it("a request after 5 minutes sends a new link that replaces the older one", async () => {
            // api.md: the link replaces any earlier link
            const start = freezeClock();
            await createHikerByStaff();
            const oldToken = await requestToken(ANNA);

            vi.setSystemTime(start + 5 * MINUTE);
            const newToken = await requestToken(ANNA);

            expect(newToken).not.toBe(oldToken);
            expect((await confirm(oldToken, NEW_PASSWORD)).status).toBe(400);
            expect((await confirm(newToken, NEW_PASSWORD)).status).toBe(204);
        });
    });

    describe("reset with the link", () => {
        it("the link sets a new password and clears the forced change", async () => {
            // PO: the hiker can recover the password via email; api.md: the reset clears must_change_password
            const anna = await createHikerByStaff();
            const token = await requestToken(ANNA);

            const res = await confirm(token, NEW_PASSWORD);

            expect(res.status).toBe(204);
            expect(res.text).toBe("");
            expect((await login(ANNA, anna.initialPassword)).res.status).toBe(401);
            const { agent, res: fresh } = await login(ANNA, NEW_PASSWORD);
            expect(fresh.status).toBe(201);
            expect(fresh.body.must_change_password).toBe(false);
            expect((await agent.get(RESERVATIONS_URL)).status).toBe(200);
        });

        it("the link works only once", async () => {
            // api.md: the link works only once
            await createHikerByStaff();
            const token = await requestToken(ANNA);
            expect((await confirm(token, NEW_PASSWORD)).status).toBe(204);

            expect((await confirm(token, OTHER_PASSWORD)).status).toBe(400);
            expect((await login(ANNA, OTHER_PASSWORD)).res.status).toBe(401);
            expect((await login(ANNA, NEW_PASSWORD)).res.status).toBe(201);
        });

        it("the link still works just before 24 hours", async () => {
            // PO + api.md: the link expires after 24 hours
            const start = freezeClock();
            await createHikerByStaff();
            const token = await requestToken(ANNA);

            vi.setSystemTime(start + 24 * HOUR - 1000);

            expect((await confirm(token, NEW_PASSWORD)).status).toBe(204);
        });

        it("the link is refused after 24 hours and the password stays the same", async () => {
            // PO + api.md: the link expires after 24 hours
            const start = freezeClock();
            const anna = await createHikerByStaff();
            const token = await requestToken(ANNA);

            vi.setSystemTime(start + 24 * HOUR);

            expect((await confirm(token, NEW_PASSWORD)).status).toBe(400);
            expect((await login(ANNA, NEW_PASSWORD)).res.status).toBe(401);
            expect((await login(ANNA, anna.initialPassword)).res.status).toBe(201);
        });

        it("an unknown token is refused", async () => {
            // api.md: 400 if the token is unknown
            await createHikerByStaff();
            await requestToken(ANNA);

            expect((await confirm("an-unknown-token-0123456789abcdefghijklmnop", NEW_PASSWORD)).status).toBe(400);
        });

        it("an invalid new password is refused without using up the link", async () => {
            // api.md: new_password 8 to 128 characters, else 400; MH-173 UI: after a rule error the link is still good
            await createHikerByStaff();
            const token = await requestToken(ANNA);

            expect((await confirm(token, "1234567")).status).toBe(400);
            expect((await confirm(token, "x".repeat(129))).status).toBe(400);
            expect((await request(app).post(CONFIRM_URL).send({ token })).status).toBe(400);
            expect((await request(app).post(CONFIRM_URL).send({ new_password: NEW_PASSWORD })).status).toBe(400);

            expect((await confirm(token, NEW_PASSWORD)).status).toBe(204);
        });

        it("sessions already open are not logged out by a reset", async () => {
            // api.md: sessions already open are not logged out (their flag is an open question, not asserted)
            const anna = await createHikerByStaff();
            const open = await loggedIn(ANNA, anna.initialPassword);
            const token = await requestToken(ANNA);

            expect((await confirm(token, NEW_PASSWORD)).status).toBe(204);

            const session = await open.get(CURRENT_SESSION_URL);
            expect(session.status).toBe(200);
            expect(session.body.email).toBe(ANNA);
            const fresh = await login(ANNA, NEW_PASSWORD);
            expect(fresh.res.status).toBe(201);
            expect(fresh.res.body.must_change_password).toBe(false);
        });
    });

    describe("stored reset tokens", () => {
        it("only a hash of the token is stored, with the 24-hour expiry", async () => {
            // database.md: token_hash is the hex SHA-256 of the emailed token; UTC times; expires_at = created_at + 24 h
            const anna = await createHikerByStaff();
            const token = await requestToken(ANNA);

            const rows = tokenRows();
            expect(rows).toHaveLength(1);
            const [row] = rows;
            expect(row.account_id).toBe(anna.id);
            expect(row.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
            expect(row.token_hash).not.toContain(token);
            expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(row.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
            expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBe(24 * HOUR);
        });

        it("an account never has more than one token", async () => {
            // database.md: at most one row per account; a newer link replaces the older one
            const start = freezeClock();
            const anna = await createHikerByStaff();
            await requestToken(ANNA);
            vi.setSystemTime(start + 5 * MINUTE);
            const newToken = await requestToken(ANNA);

            const rows = tokenRows().filter((t) => t.account_id === anna.id);
            expect(rows).toHaveLength(1);
            expect(rows[0].token_hash).toBe(createHash("sha256").update(newToken).digest("hex"));
        });

        it("expired tokens are removed on the next request", async () => {
            // database.md: a row is deleted when it is expired (on the next request)
            const start = freezeClock();
            const anna = await createHikerByStaff();
            await requestToken(ANNA);

            vi.setSystemTime(start + 24 * HOUR);
            await requestToken(MARIO);

            expect(tokenRows().filter((t) => t.account_id === anna.id)).toEqual([]);
        });

        it("a redeemed token is deleted", async () => {
            // database.md: a row is deleted when it is redeemed
            const anna = await createHikerByStaff();
            const token = await requestToken(ANNA);

            expect((await confirm(token, NEW_PASSWORD)).status).toBe(204);

            expect(tokenRows().filter((t) => t.account_id === anna.id)).toEqual([]);
        });
    });
});
