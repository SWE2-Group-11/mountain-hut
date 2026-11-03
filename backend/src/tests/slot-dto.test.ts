import { describe, expect, it } from "vitest";
import { DateSchema, GetSlotsRequestSchema } from "../models/dto/slot-dto";

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
