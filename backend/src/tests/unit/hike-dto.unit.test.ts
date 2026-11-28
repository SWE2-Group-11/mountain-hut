import { describe, expect, it } from "vitest";
import { GetPopularHikesRequestSchema, RegisterHikeRequestSchema } from "../../models/dto/hike-dto";

const BODY = {
    destination: "Viso Mozzo",
    route: "via the Chiaretto lake",
    passagePoints: ["Pian del Re"],
    plannedDepartureAt: "2030-06-15T09:00:00Z",
    expectedReturnAt: "2030-06-15T15:00:00Z",
};

describe("POST /hikes — RegisterHikeRequestSchema", () => {
    it("accepts a valid body and trims every string", () => {
        const result = RegisterHikeRequestSchema.parse({
            ...BODY, destination: "  Viso Mozzo ", route: " via the Chiaretto lake ", passagePoints: [" Pian del Re "],
        });

        expect(result).toEqual(BODY);
    });

    it("defaults missing passagePoints to []", () => {
        const { passagePoints: _, ...body } = BODY;

        expect(RegisterHikeRequestSchema.parse(body).passagePoints).toEqual([]);
    });

    it.each(["destination", "route", "plannedDepartureAt", "expectedReturnAt"])("rejects a missing %s", (field) => {
        const body: Record<string, unknown> = { ...BODY };
        delete body[field];
        expect(RegisterHikeRequestSchema.safeParse(body).success).toBe(false);
    });

    it.each([
        { destination: "   " },
        { route: "" },
        { passagePoints: [" "] },
        { passagePoints: "Pian del Re" },
        { destination: 42 },
    ])("rejects blank or mistyped fields %j", (patch) => {
        expect(RegisterHikeRequestSchema.safeParse({ ...BODY, ...patch }).success).toBe(false);
    });

    it.each([
        "2030-06-15T09:00:00.000Z",   // milliseconds
        "2030-06-15T09:00Z",          // no seconds
        "2030-06-15T09:00:00",        // no timezone
        "2030-06-15T09:00:00+02:00",  // not UTC
        "2030-06-15",
    ])("rejects the non-UTC or imprecise datetime %s", (plannedDepartureAt) => {
        expect(RegisterHikeRequestSchema.safeParse({ ...BODY, plannedDepartureAt }).success).toBe(false);
    });

    it.each([BODY.plannedDepartureAt, "2030-06-15T08:59:59Z"])(
        "rejects expectedReturnAt %s not after the departure, on the expectedReturnAt path",
        (expectedReturnAt) => {
            const result = RegisterHikeRequestSchema.safeParse({ ...BODY, expectedReturnAt });

            expect(result.success).toBe(false);
            expect(result.error?.issues[0].path).toEqual(["expectedReturnAt"]);
        },
    );
});

describe("GET /hikes/popular — GetPopularHikesRequestSchema", () => {
    it("accepts a missing limit", () => {
        expect(GetPopularHikesRequestSchema.parse({})).toEqual({});
    });

    it("coerces the query limit to a number", () => {
        expect(GetPopularHikesRequestSchema.parse({ limit: "3" })).toEqual({ limit: 3 });
    });

    it.each(["0", "-1", "2.5", "abc", ""])("rejects the non-positive or non-integer limit %j", (limit) => {
        expect(GetPopularHikesRequestSchema.safeParse({ limit }).success).toBe(false);
    });
});