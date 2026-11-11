import { describe, expect, it } from "vitest";
import {
    CreateReservationRequestSchema,
    UpdateReservationRequestSchema,
    type CreateReservationRequestDTO,
} from "../../models/dto/reservation-dto";

const VALID_REQUEST: CreateReservationRequestDTO = {
    date: "2030-06-15",
    slot: "12:00",
    partySize: 4,
};

describe("POST /reservations — CreateReservationRequestSchema", () => {
    it("accepts the mandatory fields", () => {
        const result = CreateReservationRequestSchema.safeParse(VALID_REQUEST);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual(VALID_REQUEST);
        }
    });

    it.each(["date", "slot", "partySize"])(
        "rejects a missing mandatory field: %s",
        (field) => {
            const body: Record<string, unknown> = { ...VALID_REQUEST };
            delete body[field];
            expect(CreateReservationRequestSchema.safeParse(body).success)
                .toBe(false);
        },
    );

    it.each(["00:00", "09:30", "12:00", "23:59"])(
        "accepts the HH:mm time %s",
        (slot) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST, slot,
            }).success).toBe(true);
        },
    );

    it.each(["24:00", "12:60", "-1:00", "9:30", "12:00:00", "12:00x", ""])(
        "rejects an invalid or non-padded time: %s",
        (slot) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST, slot,
            }).success).toBe(false);
        },
    );

    it("rejects a numeric slot identifier: this DTO expects a time string", () => {
        expect(CreateReservationRequestSchema.safeParse({
            ...VALID_REQUEST, slot: 12,
        }).success).toBe(false);
    });

    it("rejects an impossible date in the reservation body", () => {
        expect(CreateReservationRequestSchema.safeParse({
            ...VALID_REQUEST, date: "2030-02-30",
        }).success).toBe(false);
    });

    it.each([1, 4, 20])("accepts positive integer partySize=%s", (partySize) => {
        expect(CreateReservationRequestSchema.safeParse({
            ...VALID_REQUEST, partySize,
        }).success).toBe(true);
    });

    it.each([0, -1, 1.5, NaN, Infinity, "4", true, null])(
        "rejects a non-positive, fractional or non-numeric partySize: %s",
        (partySize) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST, partySize,
            }).success).toBe(false);
        },
    );

    it.each([null, undefined, [], "not an object"])(
        "rejects an invalid body: %s",
        (body) => {
            expect(CreateReservationRequestSchema.safeParse(body).success)
                .toBe(false);
        },
    );

    it("accepts a valid requirements array with single or multiple elements", () => {
        const body = {
            ...VALID_REQUEST,
            requirements: [
                { hasAllergies: true, details: "1 vegan, peanut allergy" },
                { hasAllergies: false, details: "2 vegetarians" }
            ]
        };
        const result = CreateReservationRequestSchema.safeParse(body);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.requirements).toHaveLength(2);
        }
    });

    it("accepts an empty requirements array", () => {
        expect(CreateReservationRequestSchema.safeParse({
            ...VALID_REQUEST, requirements: []
        }).success).toBe(true);
    });

    it.each(["hasAllergies", "details"])(
        "rejects a requirement element missing a mandatory field: %s",
        (field) => {
            const requirement: Record<string, unknown> = { hasAllergies: true, details: "Peanuts" };
            delete requirement[field];
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST, requirements: [requirement]
            }).success).toBe(false);
        },
    );

    it.each(["", "   ", "\t\n", " \n \t "])(
        "rejects blank or space-only details strings: %s",
        (details) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST,
                requirements: [{ hasAllergies: true, details }]
            }).success).toBe(false);
        },
    );

    it.each([0, 1, "true", "false", null, undefined, {}, []])(
        "rejects a non-boolean hasAllergies identifier: %s",
        (hasAllergies) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST,
                requirements: [{ hasAllergies, details: "Vegetarian" }]
            }).success).toBe(false);
        },
    );

    it.each([123, true, false, {}, []])(
        "rejects a non-string details field: %s",
        (details) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST,
                requirements: [{ hasAllergies: true, details }]
            }).success).toBe(false);
        },
    );

    it.each(["not an array", {}, true, 123])(
        "rejects an invalid requirements structure: %s",
        (requirements) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST, requirements
            }).success).toBe(false);
        },
    );
});


describe("PATCH /reservations/:id — UpdateReservationRequestSchema", () => {
    it.each([
        { date: "2030-06-15" },
        { slot: "12:00" },
        { partySize: 4 },
        { requirements: [] },
        { date: "2030-06-15", slot: "12:00" },
    ])("accepts a partial body with at least one valid field: %j", (body) => {
        expect(UpdateReservationRequestSchema.safeParse(body).success).toBe(true);
    });

    it("rejects a completely empty object", () => {
        const result = UpdateReservationRequestSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "At least one field must be provided for update."
            );
        }
    });

    it("rejects an object where all fields are explicitly undefined", () => {
        const body = {
            date: undefined,
            slot: undefined,
            partySize: undefined,
            requirements: undefined,
        };
        expect(UpdateReservationRequestSchema.safeParse(body).success).toBe(false);
    });

    it("rejects invalid data types for partial fields", () => {
        expect(UpdateReservationRequestSchema.safeParse({ partySize: "invalid" }).success).toBe(false);
        expect(UpdateReservationRequestSchema.safeParse({ slot: "24:00" }).success).toBe(false);
    });
});
