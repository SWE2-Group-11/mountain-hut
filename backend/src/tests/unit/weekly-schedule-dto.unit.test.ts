import { describe, expect, it } from "vitest";
import {
    CopyWeeklyScheduleRequestSchema,
    MAX_TARGET_WEEKS,
    type CopyWeeklyScheduleRequestDTO,
} from "../../models/dto/weekly-schedule-dto";

const SOURCE_WEEK = "2030-06-03";   // Monday
const VALID_REQUEST: CopyWeeklyScheduleRequestDTO = {
    sourceWeekStart: SOURCE_WEEK,
    targetWeekStarts: ["2030-06-17", "2030-06-24"],
};

/**
 * Builds `count` consecutive Mondays (YYYY-MM-DD), starting from 2030-06-17.
 */
function mondays(count: number): string[] {
    return Array.from({ length: count }, (_, i) =>
        new Date(Date.UTC(2030, 5, 17 + 7 * i)).toISOString().slice(0, 10));
}

describe("POST /slots/copy-week — CopyWeeklyScheduleRequestSchema", () => {
    it("accepts a source week and multiple target weeks", () => {
        const result = CopyWeeklyScheduleRequestSchema.safeParse(VALID_REQUEST);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual(VALID_REQUEST);
        }
    });

    it("accepts a single target week", () => {
        expect(CopyWeeklyScheduleRequestSchema.safeParse({
            ...VALID_REQUEST, targetWeekStarts: ["2030-06-17"],
        }).success).toBe(true);
    });

    it.each(["sourceWeekStart", "targetWeekStarts"])(
        "rejects a missing mandatory field: %s",
        (field) => {
            const body: Record<string, unknown> = { ...VALID_REQUEST };
            delete body[field];
            expect(CopyWeeklyScheduleRequestSchema.safeParse(body).success)
                .toBe(false);
        },
    );

    it.each([null, undefined, [], "not an object"])(
        "rejects an invalid body: %s",
        (body) => {
            expect(CopyWeeklyScheduleRequestSchema.safeParse(body).success)
                .toBe(false);
        },
    );

    it.each(["2030-06-04", "2030-06-08", "2030-06-09"])(
        "rejects a source week that does not start on a Monday: %s",
        (sourceWeekStart) => {
            expect(CopyWeeklyScheduleRequestSchema.safeParse({
                ...VALID_REQUEST, sourceWeekStart,
            }).success).toBe(false);
        },
    );

    it.each(["2030-06-18", "2030-06-22", "2030-06-23"])(
        "rejects a target week that does not start on a Monday: %s",
        (week) => {
            expect(CopyWeeklyScheduleRequestSchema.safeParse({
                ...VALID_REQUEST, targetWeekStarts: ["2030-06-17", week],
            }).success).toBe(false);
        },
    );

    it.each(["2030-6-3", "03-06-2030", "2030/06/03", "2030-06-03T00:00", "2030-02-30", "", 20300603, null])(
        "rejects an invalid or non-padded week start: %s",
        (sourceWeekStart) => {
            expect(CopyWeeklyScheduleRequestSchema.safeParse({
                ...VALID_REQUEST, sourceWeekStart,
            }).success).toBe(false);
        },
    );

    it.each(["not an array", "2030-06-17", {}, true, 123, null])(
        "rejects an invalid targetWeekStarts structure: %s",
        (targetWeekStarts) => {
            expect(CopyWeeklyScheduleRequestSchema.safeParse({
                ...VALID_REQUEST, targetWeekStarts,
            }).success).toBe(false);
        },
    );

    it("rejects an empty targetWeekStarts array", () => {
        expect(CopyWeeklyScheduleRequestSchema.safeParse({
            ...VALID_REQUEST, targetWeekStarts: [],
        }).success).toBe(false);
    });

    it(`accepts exactly ${MAX_TARGET_WEEKS} target weeks`, () => {
        expect(CopyWeeklyScheduleRequestSchema.safeParse({
            ...VALID_REQUEST, targetWeekStarts: mondays(MAX_TARGET_WEEKS),
        }).success).toBe(true);
    });

    it(`rejects more than ${MAX_TARGET_WEEKS} target weeks`, () => {
        expect(CopyWeeklyScheduleRequestSchema.safeParse({
            ...VALID_REQUEST, targetWeekStarts: mondays(MAX_TARGET_WEEKS + 1),
        }).success).toBe(false);
    });

    it("rejects a target week listed more than once", () => {
        expect(CopyWeeklyScheduleRequestSchema.safeParse({
            ...VALID_REQUEST, targetWeekStarts: ["2030-06-17", "2030-06-24", "2030-06-17"],
        }).success).toBe(false);
    });

    it("rejects the source week also used as a target week, reporting it on targetWeekStarts", () => {
        const result = CopyWeeklyScheduleRequestSchema.safeParse({
            ...VALID_REQUEST, targetWeekStarts: ["2030-06-17", SOURCE_WEEK],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.map((issue) => issue.path))
                .toContainEqual(["targetWeekStarts"]);
        }
    });

    it("strips unknown fields such as copyBookings instead of forwarding them", () => {
        // Bookings are never copied: no option in the body can enable it
        const result = CopyWeeklyScheduleRequestSchema.safeParse({
            ...VALID_REQUEST, copyBookings: true,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).not.toHaveProperty("copyBookings");
        }
    });
});