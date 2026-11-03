import { describe, expect, it } from "vitest";
import {
    DateSchema,
    GetAvailabilityRequestSchema,
    GetSlotsRequestSchema,
} from "../models/dto/slot-dto";

const DAY = "2030-06-15";

describe("DateSchema — shared calendar-date validation", () => {
    it.each([
        "2030-06-15",
        "2028-02-29",
        "2030-01-01",
        "2030-12-31",
    ])("accepts the real calendar date %s", (date) => {
        expect(DateSchema.safeParse(date).success).toBe(true);
    });

    it.each([
        "2026-02-30",
        "2027-02-29",
        "2030-04-31",
        "2030-13-01",
        "2030-00-01",
        "2030-06-00",
        "2030-06-32",
        "15-06-2030",
        "2030-6-15",
        "2030-06-5",
        "2030-06-15T12:00:00",
        "",
    ])("rejects the invalid date %s", (date) => {
        expect(DateSchema.safeParse(date).success).toBe(false);
    });

    it.each([null, undefined, 20300615, true])(
        "rejects a date with the wrong type: %s",
        (date) => {
            expect(DateSchema.safeParse(date).success).toBe(false);
        },
    );
});

describe("GET /slots — GetSlotsRequestSchema", () => {
    it("accepts the required query date", () => {
        expect(GetSlotsRequestSchema.parse({ date: DAY })).toEqual({ date: DAY });
    });

    it("rejects a missing query date", () => {
        expect(GetSlotsRequestSchema.safeParse({}).success).toBe(false);
    });

    it.each(["", "2030-02-30", "15/06/2030"])(
        "rejects the invalid query date %s",
        (date) => {
            expect(GetSlotsRequestSchema.safeParse({ date }).success).toBe(false);
        },
    );

    it("rejects a repeated query date represented as an array", () => {
        expect(GetSlotsRequestSchema.safeParse({
            date: [DAY, "2030-06-16"],
        }).success).toBe(false);
    });
});

describe("GET /slots/availability — GetAvailabilityRequestSchema", () => {
    // Query values always arrive as strings
    const QUERY = { date: DAY, slot: "12:00", partySize: "4" };

    it("accepts the query and turns partySize into a number", () => {
        // Why: the controller and the DAO expect a numeric party size
        const result = GetAvailabilityRequestSchema.safeParse(QUERY);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ date: DAY, slot: "12:00", partySize: 4 });
        }
    });

    it.each(["date", "slot", "partySize"])(
        "rejects a missing query parameter: %s",
        (field) => {
            // Why: all three parameters are required by api.md
            const query: Record<string, unknown> = { ...QUERY };
            delete query[field];

            expect(GetAvailabilityRequestSchema.safeParse(query).success).toBe(false);
        },
    );

    it.each(["00:00", "09:30", "12:00", "23:59"])(
        "accepts the HH:mm time %s",
        (slot) => {
            // Why: slot start times are stored as zero-padded HH:mm
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, slot,
            }).success).toBe(true);
        },
    );

    it.each(["24:00", "12:60", "9:30", "12:00:00", "12:00x", ""])(
        "rejects an invalid or non-padded time: %s",
        (slot) => {
            // Why: a badly formatted time could never match a stored slot
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, slot,
            }).success).toBe(false);
        },
    );

    it.each(["2026-02-30", "2030-6-15", "15/06/2030", ""])(
        "rejects the invalid query date %s",
        (date) => {
            // Why: the shared DateSchema must be applied here too
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, date,
            }).success).toBe(false);
        },
    );

    it.each(["1", "4", "20"])(
        "accepts the positive integer partySize %s",
        (partySize) => {
            // Why: any positive whole number of people is a valid party
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, partySize,
            }).success).toBe(true);
        },
    );

    it.each(["0", "-1", "2.5", "abc", "", " ", "true"])(
        "rejects a non-positive, fractional or non-numeric partySize: %s",
        (partySize) => {
            // Why: these cannot be a number of people
            expect(GetAvailabilityRequestSchema.safeParse({
                ...QUERY, partySize,
            }).success).toBe(false);
        },
    );

    it.each([
        { field: "partySize", value: ["2", "3"] },
        { field: "date", value: [DAY, "2030-06-16"] },
    ])("rejects a repeated query $field represented as an array", ({ field, value }) => {
        // Why: ?partySize=2&partySize=3 is ambiguous and must not be guessed
        expect(GetAvailabilityRequestSchema.safeParse({
            ...QUERY, [field]: value,
        }).success).toBe(false);
    });

    it("drops unknown query parameters", () => {
        // Why: extra values like hiker_id must never reach the controller
        const result = GetAvailabilityRequestSchema.parse({
            ...QUERY, extra: "x", hiker_id: "1",
        });

        expect(result).toEqual({ date: DAY, slot: "12:00", partySize: 4 });
        expect(result).not.toHaveProperty("hiker_id");
    });
});

describe("GetAvailabilityRequestSchema: strict partySize (fix MH-55)", () => {
    const CLEAR_MESSAGE = "partySize must be a positive integer";
    const query = (partySize: unknown) => ({ date: DAY, slot: "12:00", partySize });

    it.each(["0x10", "1e2", " 7 ", "07", "4.0"])(
        "rejects the partySize %j, which is not written as plain digits",
        (partySize) => {
            // before the fix, Number() turned these into valid numbers (16, 100, 7, 7, 4)
            // Arrange
            const input = query(partySize);

            // Act
            const result = GetAvailabilityRequestSchema.safeParse(input);

            // Assert
            expect(result.success).toBe(false);
        },
    );

    it("rejects a repeated partySize represented as an array", () => {
        // ?partySize=4&partySize=5 arrives as an array: before the fix ["4"] became 4
        // Arrange
        const input = query(["4"]);

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(false);
    });

    it("rejects a partySize given as a number", () => {
        // query values always arrive as strings, so a number means the input is not a query
        // Arrange
        const input = query(4);

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(false);
    });

    it("rejects a missing partySize with the clear message", () => {
        // the user must read a helpful message, not "received NaN"
        // Arrange
        const input = { date: DAY, slot: "12:00" };

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.issues[0].message).toBe(CLEAR_MESSAGE);
    });

    it.each([
        ["1", 1],
        ["12", 12],
    ])("accepts the partySize %j and turns it into the number %d", (partySize, expected) => {
        // the controller and the DAO work with a number, not with a string
        // Arrange
        const input = query(partySize);

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(true);
        expect(result.data?.partySize).toBe(expected);
        expect(typeof result.data?.partySize).toBe("number");
    });

    it("rejects a partySize above the safe integer range", () => {
        // "99999999999999999999" is only digits, but as a number it can't be stored exactly (it becomes 1e20)
        // Arrange
        const input = query("99999999999999999999");

        // Act
        const result = GetAvailabilityRequestSchema.safeParse(input);

        // Assert
        expect(result.success).toBe(false);
    });
});
