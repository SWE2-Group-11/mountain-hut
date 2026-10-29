import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Slot } from "../models/entities/slot";
import { isBookingOpen } from "../services/booking-rules";

const ORIGINAL_SERVER_TIMEZONE = process.env.TZ;

function makeSlot(date = "2030-06-15", startTime = "12:00"): Slot {
    return new Slot(date, startTime, 60);
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T07:00:00Z"));
});

afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_SERVER_TIMEZONE === undefined) {
        delete process.env.TZ;
    } else {
        process.env.TZ = ORIGINAL_SERVER_TIMEZONE;
    }
});

describe("isBookingOpen — the two-hour cutoff in the hut timezone", () => {
    // All expected instants below use explicit UTC offsets. Noon in Rome is
    // 10:00 UTC in summer and 11:00 UTC in winter.
    it.each([
        { label: "summer", date: "2030-06-15", deadline: "2030-06-15T08:00:00Z" },
        { label: "winter", date: "2030-01-15", deadline: "2030-01-15T09:00:00Z" },
        { label: "DST start day", date: "2030-03-31", deadline: "2030-03-31T08:00:00Z" },
        { label: "DST end day", date: "2030-10-27", deadline: "2030-10-27T09:00:00Z" },
    ])("$label: accepts the exact cutoff and rejects the next millisecond", ({
        date, deadline,
    }) => {
        const slot = makeSlot(date);
        const cutoff = new Date(deadline);

        expect(isBookingOpen(slot, new Date(cutoff.getTime() - 1))).toBe(true);
        expect(isBookingOpen(slot, cutoff)).toBe(true);
        expect(isBookingOpen(slot, new Date(cutoff.getTime() + 1))).toBe(false);
    });

    it("uses the current clock when the optional now argument is omitted", () => {
        vi.setSystemTime(new Date("2030-06-15T08:00:00Z"));
        expect(isBookingOpen(makeSlot())).toBe(true);

        vi.setSystemTime(new Date("2030-06-15T08:00:00.001Z"));
        expect(isBookingOpen(makeSlot())).toBe(false);
    });

    it.each(["2030-06-15T09:59:59Z", "2030-06-15T10:00:00Z", "2030-06-15T13:00:00Z"])(
        "rejects a closed booking window at %s",
        (now) => {
            expect(isBookingOpen(makeSlot(), new Date(now))).toBe(false);
        },
    );

    it.each(["UTC", "Europe/Rome", "America/New_York"])(
        "does not change the booking result when the server runs in %s",
        (serverTimezone) => {
            process.env.TZ = serverTimezone;

            expect(isBookingOpen(
                makeSlot(), new Date("2030-06-15T07:30:00Z"),
            )).toBe(true);
            expect(isBookingOpen(
                makeSlot(), new Date("2030-06-15T08:30:00Z"),
            )).toBe(false);
        },
    );
});
