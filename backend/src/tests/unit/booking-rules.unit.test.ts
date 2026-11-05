import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Slot } from "../../models/entities/slot";
import { isBookingOpen, assignSeats } from "../../domain/booking-rules";

const ORIGINAL_SERVER_TIMEZONE = process.env.TZ;

function makeSlot(date = "2030-06-15", startTime = "12:00"): Slot {
    return new Slot(date, startTime, 60);
}

const table = (table_number: number, seats: number, free_seats = seats) => ({ table_number, seats, free_seats });

const seatsFor = (tables: ReturnType<typeof table>[], party_size: number) =>
    assignSeats(tables, party_size)!.map((a) => [a.table_number, a.assigned_seats]);

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

describe("assignSeats — seating a party on the tables of a slot", () => {
    it("spreads a party over several tables and shows the seats of each one", () => {
        const tables = [table(1, 2), table(2, 2), table(3, 2)];

        const result = seatsFor(tables, 6);

        expect(result).toEqual([[1, 2], [2, 2], [3, 2]]);
    });

    it("uses one table when it is enough, the smallest that fits", () => {
        const tables = [table(1, 8), table(2, 4), table(3, 6)];

        const forFour = seatsFor(tables, 4);
        const forFive = seatsFor(tables, 5);

        expect(forFour).toEqual([[2, 4]]);
        expect(forFive).toEqual([[3, 5]]);
    });

    it("looks at the free seats of a table, not at its size", () => {
        const tables = [table(1, 6, 2), table(2, 4)];

        const forTwo = seatsFor(tables, 2);
        const forThree = seatsFor(tables, 3);

        expect(forTwo).toEqual([[1, 2]]);
        expect(forThree).toEqual([[2, 3]]);
    });

    it("seats the party when the free seats of a table are exactly the party size", () => {
        const tables = [table(1, 4)];

        const result = seatsFor(tables, 4);

        expect(result).toEqual([[1, 4]]);
    });

    it("can fill every free seat of the slot", () => {
        const tables = [table(1, 4), table(2, 6, 3)];

        const result = seatsFor(tables, 7);

        expect(result).toEqual([[1, 4], [2, 3]]);
    });

    it("spreads the party over the fewest tables when no single table fits", () => {
        const tables = [table(1, 2), table(2, 2), table(3, 2), table(4, 6)];

        const result = seatsFor(tables, 8);

        expect(result).toEqual([[4, 6], [1, 2]]);
    });

    it("puts the people left on the smallest table that fits them", () => {
        const tables = [table(1, 4), table(2, 6), table(3, 2)];

        const result = seatsFor(tables, 9);

        expect(result).toEqual([[2, 6], [1, 3]]);
    });

    it("can seat a party on many small tables", () => {
        const tables = [1, 2, 3, 4, 5, 6].map((n) => table(n, 1));

        const result = seatsFor(tables, 5);

        expect(result).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
    });

    it("assigns seats that add up to the party size, at least 1 per table", () => {
        const tables = [table(1, 4), table(2, 6, 3), table(3, 2)];

        for (let party_size = 1; party_size <= 9; party_size++) {
            const result = assignSeats(tables, party_size)!;

            const total = result.reduce((sum, a) => sum + a.assigned_seats, 0);
            expect(total).toBe(party_size);
            result.forEach((a) => expect(a.assigned_seats).toBeGreaterThanOrEqual(1));
        }
    });

    it("does not change the tables it receives", () => {
        const tables = [table(1, 2), table(2, 6), table(3, 4)];
        const copy = structuredClone(tables);

        assignSeats(tables, 8);

        expect(tables).toEqual(copy);
    });

    it("returns null when the slot has not enough free seats", () => {

        const tables = [table(1, 4), table(2, 6, 3)];

        const result = assignSeats(tables, 8);

        expect(result).toBeNull();
    });

    it("returns null when every table is full", () => {
        const tables = [table(1, 4, 0), table(2, 2, 0)];

        const result = assignSeats(tables, 1);

        expect(result).toBeNull();
    });

    it("returns null when there are no tables", () => {
        const result = assignSeats([], 1);

        expect(result).toBeNull();
    });

    it("returns null for a party of 0 or fewer people", () => {
        const tables = [table(1, 4)];

        const forZero = assignSeats(tables, 0);
        const forNegative = assignSeats(tables, -1);

        expect(forZero).toBeNull();
        expect(forNegative).toBeNull();
    });
});

describe("assignSeats: non-integer party size", () => {
    it.each([2.5, 1.5])("returns null for a party of %s people, even when there are enough seats", (party_size) => {
        const result = assignSeats([table(1, 4)], party_size);
        expect(result).toBeNull();
    });

    it("still seats a whole party size, as before the fix", () => {
        const result = assignSeats([table(1, 4)], 2);
        expect(result).toEqual([{ table_number: 1, assigned_seats: 2 }]);
    });
});