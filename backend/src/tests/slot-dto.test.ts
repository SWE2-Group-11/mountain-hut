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
