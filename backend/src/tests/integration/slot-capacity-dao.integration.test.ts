import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../database/database";
import { getSavedConfigurations, getSlot, getSlotTables, saveSlot } from "../../dao/slot-dao";
import { dayFromToday, resetTestDatabase } from "../helpers";

// Integration tests of the slot DAO: the real SQL on the in-memory database filled with the seed.
// They check what a mocked database cannot: the transaction, the constraints and the ordering.

// The helpers load the whole app, whose booking route would send an email
vi.mock("../../notifications/booking-confirmation", () => ({ notifyBookingCreated: vi.fn() }));

const TOMORROW = dayFromToday(1);
const DAY = dayFromToday(10);
const TABLES = [
    { table_number: 1, seats: 4 },
    { table_number: 2, seats: 6 },
];

const slotCount = (date: string): number =>
    (db.prepare("SELECT COUNT(*) AS n FROM slot WHERE date = ?").get(date) as { n: number }).n;
const tableCount = (): number =>
    (db.prepare("SELECT COUNT(*) AS n FROM slot_table").get() as { n: number }).n;

beforeEach(() => resetTestDatabase());

describe("saveSlot - saving a slot with its tables", () => {
    it("saves the slot and all its tables and returns them", () => {
        const saved = saveSlot(DAY, "12:00", 90, TABLES);

        expect(saved?.slot).toMatchObject({ date: DAY, start_time: "12:00", duration: 90 });
        expect(saved?.tables.map(({ table_number, seats }) => ({ table_number, seats }))).toEqual(TABLES);
        expect(getSlot(DAY, "12:00")).toMatchObject({ duration: 90 });
        expect(getSlotTables(DAY, "12:00").map(({ table_number, seats }) => ({ table_number, seats }))).toEqual(TABLES);
    });

    it("returns null for an overlapping slot and leaves the database as it was", () => {
        const tablesBefore = tableCount();

        const saved = saveSlot(TOMORROW, "12:30", 60, TABLES); // the seeded slot runs from 12:00 to 13:00

        expect(saved).toBeNull();
        expect(slotCount(TOMORROW)).toBe(3);
        expect(tableCount()).toBe(tablesBefore);
    });

    it("saves nothing at all when one of its tables is rejected by the database", () => {
        const tablesBefore = tableCount();

        // The same table number twice breaks the primary key of the second insert
        expect(() =>
            saveSlot(DAY, "12:00", 60, [
                { table_number: 1, seats: 4 },
                { table_number: 1, seats: 6 },
            ])
        ).toThrow();

        expect(getSlot(DAY, "12:00")).toBeNull(); // the slot row was rolled back, not left without tables
        expect(tableCount()).toBe(tablesBefore);
    });

    it("saves nothing when a table has no seats", () => {
        expect(() => saveSlot(DAY, "12:00", 60, [{ table_number: 1, seats: 0 }])).toThrow();

        expect(getSlot(DAY, "12:00")).toBeNull();
    });

    it.each([
        { label: "right before", start: "11:00", duration: 60 },
        { label: "right after", start: "13:00", duration: 60 },
    ])("accepts a slot that touches the seeded one ($label)", ({ start, duration }) => {
        expect(saveSlot(dayFromToday(2), start, duration, TABLES)).not.toBeNull();
    });

    it("compares the times as minutes of the day, not as text", () => {
        // 09:30-10:30 and 10:00-11:00 overlap even though "09:30" sorts before "10:00" only as text
        saveSlot(DAY, "09:30", 60, TABLES);

        expect(saveSlot(DAY, "10:00", 60, TABLES)).toBeNull();
        expect(saveSlot(DAY, "10:30", 60, TABLES)).not.toBeNull();
    });
});

describe("getSavedConfigurations - the slots that can be reused", () => {
    it("returns the most recent date first and the latest start time first within a date", () => {
        const result = getSavedConfigurations(null, null, 20);

        expect(result.map(({ slot }) => `${slot.date} ${slot.start_time}`)).toEqual([
            `${dayFromToday(2)} 12:00`,
            `${TOMORROW} 19:30`,
            `${TOMORROW} 13:00`,
            `${TOMORROW} 12:00`,
        ]);
    });

    it("returns each slot with its own tables", () => {
        saveSlot(DAY, "12:00", 60, TABLES);

        const [latest] = getSavedConfigurations(null, null, 1);

        expect(latest.slot.date).toBe(DAY);
        expect(latest.tables.map(({ table_number, seats }) => ({ table_number, seats }))).toEqual(TABLES);
    });

    it("keeps the dates of the range, bounds included, and applies the limit after the filter", () => {
        const inRange = getSavedConfigurations(TOMORROW, TOMORROW, 2);

        expect(inRange).toHaveLength(2);
        expect(inRange.every(({ slot }) => slot.date === TOMORROW)).toBe(true);
    });

    it("returns [] when no slot falls in the range", () => {
        expect(getSavedConfigurations(dayFromToday(30), dayFromToday(40), 20)).toEqual([]);
    });

    it("lists a slot that has no tables, with an empty list of tables", () => {
        db.prepare("INSERT INTO slot (date, start_time, duration) VALUES (?, '10:00', 60)").run(DAY);

        const [latest] = getSavedConfigurations(DAY, DAY, 1);

        expect(latest.slot.start_time).toBe("10:00");
        expect(latest.tables).toEqual([]);
    });
});
