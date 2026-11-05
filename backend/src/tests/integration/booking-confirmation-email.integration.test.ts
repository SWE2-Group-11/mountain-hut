import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import { MAIL_FROM } from "../../config/mail-config";
import type { MailMessage } from "../../notifications/mail-sender";
import { formatBookingReference, formatSlotDate } from "../../notifications/booking-confirmation";
import {
    resetTestDatabase, dayFromToday, huTime, loginAs, createHikerWithoutBookings,
    MARIO, LAURA, EMPLOYEE, NEW_HIKER,
} from "../helpers";

/*
 * Booking confirmation email (MH-43) sent by POST /api/v1/reservations (route of MH-61).
 * Everything is real (session, route, controller, DAO, query, template) except the SMTP
 * transport: createNodemailerSender returns an in-memory inbox, so no network is involved.
 */
const mail = vi.hoisted(() => ({
    inbox: [] as MailMessage[],
    send: vi.fn(),
}));

vi.mock("../../notifications/mail-sender", () => ({
    createNodemailerSender: () => ({ send: mail.send }),
}));

const RESERVATIONS_URL = "/api/v1/reservations";

// Computed once: tests that fake the clock would otherwise shift it
const tomorrow = dayFromToday(1);

/** The email is sent in the background after the response: wait until it reaches the inbox. */
const waitForEmails = (count: number) =>
    vi.waitFor(() => expect(mail.inbox).toHaveLength(count));

/**
 * Proves a rejected request scheduled no email: confirmations are sent in request order
 * (setImmediate is FIFO), so once a later valid booking has been confirmed, any email of
 * the rejected request would already be in the inbox.
 */
const expectOnlyNextBookingConfirmed = async () => {
    const hiker = await loginAs(NEW_HIKER);
    expect((await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 1 })).status).toBe(201);
    await vi.waitFor(() => expect(mail.inbox.map((m) => m.to)).toContain(NEW_HIKER));
    expect(mail.inbox.map((m) => m.to)).toEqual([NEW_HIKER]);
};

describe("Booking confirmation email - integration", () => {
    const book = (slot: string, partySize: number, date = tomorrow) => ({ date, slot, partySize });

    beforeEach(() => {
        resetTestDatabase();
        createHikerWithoutBookings();
        mail.inbox.length = 0;
        mail.send.mockReset();
        mail.send.mockImplementation(async (message: MailMessage) => {
            mail.inbox.push(message);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("after a successful booking", () => {
        it("sends one email to the hiker with the booking details", async () => {
            const mario = await loginAs(MARIO);

            const res = await mario.post(RESERVATIONS_URL).send(book("13:00", 3));

            expect(res.status).toBe(201);
            await waitForEmails(1);
            const [email] = mail.inbox;
            const reference = formatBookingReference(res.body.id);
            expect(email).toMatchObject({
                from: MAIL_FROM,
                to: MARIO,
                subject: `Booking confirmed: ${reference}`,
            });
            expect(email.text).toContain("Hello Mario Rossi,");
            expect(email.text).toContain(`Booking reference: ${reference}`);
            expect(email.text).toContain(`Date: ${formatSlotDate(tomorrow)}`);
            expect(email.text).toContain("Time slot: 13:00–14:00");
            expect(email.text).toContain("Party size: 3");
            expect(email.text).toContain("No party requirements.");
            expect(email.html).toContain(`<strong>${reference}</strong>`);
        });

        it("shows the end time from the slot duration", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL).send(book("19:30", 2)); // 90-minute slot

            expect(res.status).toBe(201);
            await waitForEmails(1);
            expect(mail.inbox[0].to).toBe(NEW_HIKER);
            expect(mail.inbox[0].text).toContain("Time slot: 19:30–21:00");
        });

        it("reports the whole party when it is split over several tables", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL).send(book("12:00", 7)); // free: 3 + 4

            expect(res.body.seatings).toHaveLength(2);
            await waitForEmails(1);
            expect(mail.inbox[0].text).toContain("Party size: 7");
        });

        it("sends each hiker their own confirmation", async () => {
            const mario = await loginAs(MARIO);
            const laura = await loginAs(LAURA);

            const first = await mario.post(RESERVATIONS_URL).send(book("13:00", 2));
            const second = await laura.post(RESERVATIONS_URL).send(book("13:00", 4));

            await waitForEmails(2);
            expect(mail.inbox.map(({ to, subject }) => ({ to, subject }))).toEqual(
                expect.arrayContaining([
                    { to: MARIO, subject: `Booking confirmed: ${formatBookingReference(first.body.id)}` },
                    { to: LAURA, subject: `Booking confirmed: ${formatBookingReference(second.body.id)}` },
                ])
            );
        });

        it("escapes the hiker name in the HTML body", async () => {
            db.prepare(
                "UPDATE hiker SET full_name = ? WHERE account_id = (SELECT id FROM account WHERE email = ?)"
            ).run("<b>Eve</b> & Co", NEW_HIKER);
            const hiker = await loginAs(NEW_HIKER);

            await hiker.post(RESERVATIONS_URL).send(book("13:00", 1));

            await waitForEmails(1);
            expect(mail.inbox[0].html).toContain("Hello &lt;b&gt;Eve&lt;/b&gt; &amp; Co,");
            expect(mail.inbox[0].html).not.toContain("<b>Eve</b>");
            expect(mail.inbox[0].text).toContain("Hello <b>Eve</b> & Co,"); // plain text stays as typed
        });
    });

    describe("when the mail server fails", () => {
        it("still answers 201, keeps the booking and logs the failure", async () => {
            const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
            mail.send.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:1025"));
            const mario = await loginAs(MARIO);
            const countBookings = db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM booking");
            const before = countBookings.get()!.n;

            const res = await mario.post(RESERVATIONS_URL).send(book("13:00", 2));

            expect(res.status).toBe(201);
            expect(countBookings.get()!.n).toBe(before + 1);
            await vi.waitFor(() =>
                expect(errorLog).toHaveBeenCalledWith(
                    `Booking confirmation failed for booking ${res.body.id}:`,
                    "connect ECONNREFUSED 127.0.0.1:1025"
                )
            );
            expect(mail.inbox).toHaveLength(0);
        });

        it("sends the next confirmation once the server is back", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            mail.send.mockRejectedValueOnce(new Error("SMTP down"));
            const mario = await loginAs(MARIO);
            const laura = await loginAs(LAURA);

            await mario.post(RESERVATIONS_URL).send(book("13:00", 2));
            await vi.waitFor(() => expect(mail.send).toHaveBeenCalledTimes(1));
            await laura.post(RESERVATIONS_URL).send(book("13:00", 2));

            await waitForEmails(1);
            expect(mail.inbox[0].to).toBe(LAURA);
        });
    });

    describe("when no booking is created", () => {
        it.each([
            ["a party larger than the free seats (409)", "12:00", 8, 409],
            ["a time that is not a slot (400)", "15:00", 2, 400],
            ["an invalid party size (400)", "13:00", 0, 400],
        ])("sends nothing for %s", async (_label, slot, partySize, status) => {
            const mario = await loginAs(MARIO);

            const res = await mario.post(RESERVATIONS_URL).send(book(slot, partySize));

            expect(res.status).toBe(status);
            await expectOnlyNextBookingConfirmed();
        });

        it("sends nothing when the booking window is closed (400)", async () => {
            const hiker = await loginAs(NEW_HIKER);
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(huTime(tomorrow, "10:01")); // the 12:00 slot closed at 10:00

            const res = await hiker.post(RESERVATIONS_URL).send(book("12:00", 2));

            expect(res.status).toBe(400);
            await expectOnlyNextBookingConfirmed();
        });

        it("sends nothing to a visitor (401) or a staff account (403)", async () => {
            const employee = await loginAs(EMPLOYEE);

            expect((await request(app).post(RESERVATIONS_URL).send(book("13:00", 2))).status).toBe(401);
            expect((await employee.post(RESERVATIONS_URL).send(book("13:00", 2))).status).toBe(403);

            await expectOnlyNextBookingConfirmed();
        });
    });
});
