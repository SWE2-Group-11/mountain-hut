import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import {
    buildBookingConfirmationData,
    formatBookingReference,
    formatSlot,
    formatSlotDate,
    notifyBookingCreated,
    sendBookingConfirmation,
} from "../../notifications/booking-confirmation";
import type { BookingConfirmationDeps } from "../../notifications/booking-confirmation";
import { MAIL_FROM, SMTP_HOST, SMTP_PORT } from "../../config/mail-config";

// No SQL or SMTP is executed, including when testing the default dependencies.
const mocks = vi.hoisted(() => ({
    appDb: { name: ":memory:", prepare: vi.fn() },
    createSender: vi.fn(),
    render: vi.fn(),
}));
vi.mock("../../database/database", () => ({ db: mocks.appDb }));
vi.mock("../../notifications/mail-sender", () => ({ createNodemailerSender: mocks.createSender }));
vi.mock("../../notifications/booking-confirmation-template", () => ({ renderBookingConfirmation: mocks.render }));

const BOOKING_ID = 123;
const FROM = "Mountain Hut <sender@example.test>";
const ROW = {
    id: BOOKING_ID,
    full_name: "Laura Bianchi",
    email: "laura@example.test",
    slot_date: "2026-11-07",
    slot_start_time: "19:30",
    duration: 90,
    party_size: 7,
};
const REQUIREMENTS = [
    { allergy_flag: 1, description: "Peanut allergy" },
    { allergy_flag: 0, description: "Two vegetarians" },
];
const EXPECTED_DATA = {
    bookingReference: "MH-000123",
    hikerName: "Laura Bianchi",
    date: "Sat 7 Nov 2026",
    slot: "19:30–21:00",
    partySize: 7,
    requirements: [
        { allergies: true, description: "Peanut allergy" },
        { allergies: false, description: "Two vegetarians" },
    ],
};
const RENDERED = { subject: "Test subject", html: "<p>Test body</p>", text: "Test body" };

function makeDeps() {
    const get = vi.fn().mockReturnValue({ ...ROW });
    const all = vi.fn().mockReturnValue(REQUIREMENTS.map(row => ({ ...row })));
    // Only the statement methods used by this unit are supplied. SQL is not interpreted.
    const prepare = vi.fn().mockReturnValue({ get, all });
    const send = vi.fn<(message: {
        from: string; to: string; subject: string; html: string; text: string;
    }) => Promise<void>>().mockResolvedValue(undefined);
    const deps: BookingConfirmationDeps = {
        db: { prepare } as unknown as Database.Database,
        sender: { send },
        from: FROM,
    };
    return { deps, get, all, prepare, send };
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.render.mockReturnValue({ ...RENDERED });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("booking confirmation formatting", () => {
    it.each([
        [1, "MH-000001"],
        [123, "MH-000123"],
        [123456, "MH-123456"],
        [1234567, "MH-1234567"],
    ])("formats booking %i as %s without truncating the ID", (id, expected) => {
        expect(formatBookingReference(id)).toBe(expected);
    });

    it.each([
        ["2026-11-07", "Sat 7 Nov 2026"],
        ["2028-02-29", "Tue 29 Feb 2028"],
        ["2027-01-01", "Fri 1 Jan 2027"],
    ])("formats the calendar date %s", (date, expected) => {
        expect(formatSlotDate(date)).toBe(expected);
    });

    it.each([
        ["12:00", 60, "12:00–13:00"],
        ["19:30", 90, "19:30–21:00"],
        ["08:05", 7, "08:05–08:12"],
        ["23:00", 59, "23:00–23:59"],
    ])("formats %s plus %i minutes", (start, duration, expected) => {
        expect(formatSlot(start, duration)).toBe(expected);
    });
});

describe("buildBookingConfirmationData", () => {
    it("maps the recipient, formatted booking details and dietary requirements", () => {
        const { deps, get, all } = makeDeps();

        expect(buildBookingConfirmationData(deps.db, BOOKING_ID)).toEqual({
            to: ROW.email,
            data: EXPECTED_DATA,
        });
        expect(get).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
        expect(all).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
    });

    it("returns an empty list when the requirements query has no rows", () => {
        const { deps, all } = makeDeps();
        all.mockReturnValue([]);

        expect(buildBookingConfirmationData(deps.db, BOOKING_ID)?.data.requirements).toEqual([]);
    });

    it("returns null and skips the requirements lookup when the booking query has no row", () => {
        const { deps, get, all } = makeDeps();
        get.mockReturnValue(undefined);

        expect(buildBookingConfirmationData(deps.db, BOOKING_ID)).toBeNull();
        expect(all).not.toHaveBeenCalled();
    });

    it.each(["booking", "requirements"])("propagates a failure of the %s query", query => {
        const { deps, get, all } = makeDeps();
        const failure = new Error("Database read failed");
        (query === "booking" ? get : all).mockImplementation(() => { throw failure; });

        expect(() => buildBookingConfirmationData(deps.db, BOOKING_ID)).toThrow(failure);
    });
});

describe("sendBookingConfirmation", () => {
    it("renders the mapped data and sends one message to the hiker", async () => {
        const { deps, send } = makeDeps();

        await expect(sendBookingConfirmation(BOOKING_ID, deps)).resolves.toBe(true);

        expect(mocks.render).toHaveBeenCalledExactlyOnceWith(EXPECTED_DATA);
        expect(send).toHaveBeenCalledExactlyOnceWith({ from: FROM, to: ROW.email, ...RENDERED });
    });

    it("skips rendering and sending when there is no booking row", async () => {
        const { deps, get, send } = makeDeps();
        get.mockReturnValue(undefined);

        await expect(sendBookingConfirmation(BOOKING_ID, deps)).resolves.toBe(false);

        expect(mocks.render).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalled();
    });

    it.each(["", "   ", "\t\n"])("skips a recipient containing only whitespace: %j", async email => {
        const { deps, get, send } = makeDeps();
        get.mockReturnValue({ ...ROW, email });

        await expect(sendBookingConfirmation(BOOKING_ID, deps)).resolves.toBe(false);

        expect(mocks.render).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });

    it("propagates an SMTP failure without reporting a successful send", async () => {
        const { deps, send } = makeDeps();
        const failure = new Error("SMTP unavailable");
        send.mockRejectedValue(failure);

        await expect(sendBookingConfirmation(BOOKING_ID, deps)).rejects.toBe(failure);

        expect(send).toHaveBeenCalledTimes(1);
        expect(console.log).not.toHaveBeenCalled();
    });

    it("does not call the sender if rendering fails", async () => {
        const { deps, send } = makeDeps();
        const failure = new Error("Template failed");
        mocks.render.mockImplementation(() => { throw failure; });

        await expect(sendBookingConfirmation(BOOKING_ID, deps)).rejects.toBe(failure);
        expect(send).not.toHaveBeenCalled();
    });

    it("does not call the renderer or sender if reading the database fails", async () => {
        const { deps, get, send } = makeDeps();
        const failure = new Error("Database read failed");
        get.mockImplementation(() => { throw failure; });

        await expect(sendBookingConfirmation(BOOKING_ID, deps)).rejects.toBe(failure);
        expect(mocks.render).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });
});

describe("notifyBookingCreated", () => {
    it("defers the work and resolves after the sender finishes", async () => {
        const { deps, get, send } = makeDeps();
        let finishSend!: () => void;
        send.mockImplementation(() => new Promise<void>(resolve => { finishSend = resolve; }));

        const notification = notifyBookingCreated(BOOKING_ID, deps);
        expect(get).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();

        let finished = false;
        void notification.then(() => { finished = true; });
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(send).toHaveBeenCalledTimes(1);
        expect(finished).toBe(false);

        finishSend();
        await expect(notification).resolves.toBeUndefined();
        expect(console.error).not.toHaveBeenCalled();
    });

    it.each(["database", "template", "SMTP"])("logs a %s failure and still resolves", async stage => {
        const { deps, get, send } = makeDeps();
        const failure = new Error(`${stage} unavailable`);
        if (stage === "database") get.mockImplementation(() => { throw failure; });
        else if (stage === "template") mocks.render.mockImplementation(() => { throw failure; });
        else send.mockRejectedValue(failure);

        await expect(notifyBookingCreated(BOOKING_ID, deps)).resolves.toBeUndefined();

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining(String(BOOKING_ID)), failure.message);
        if (stage !== "SMTP") expect(send).not.toHaveBeenCalled();
    });

    it("resolves without sending if the booking is skipped", async () => {
        const { deps, get, send } = makeDeps();
        get.mockReturnValue(undefined);

        await expect(notifyBookingCreated(BOOKING_ID, deps)).resolves.toBeUndefined();

        expect(send).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalled();
    });

    it("creates the default sender lazily and reuses it with the configured sender address", async () => {
        // A fresh module isolates the cached defaultSender from other tests.
        vi.resetModules();
        const freshModule = await import("../../notifications/booking-confirmation.js");
        const { prepare, send } = makeDeps();
        mocks.appDb.prepare.mockImplementation(prepare);
        mocks.createSender.mockReturnValue({ send });
        expect(mocks.createSender).not.toHaveBeenCalled();

        await freshModule.notifyBookingCreated(BOOKING_ID);
        await freshModule.notifyBookingCreated(BOOKING_ID);

        expect(mocks.createSender).toHaveBeenCalledExactlyOnceWith({ host: SMTP_HOST, port: SMTP_PORT });
        expect(send).toHaveBeenCalledTimes(2);
        expect(send).toHaveBeenCalledWith({ from: MAIL_FROM, to: ROW.email, ...RENDERED });
    });
});
