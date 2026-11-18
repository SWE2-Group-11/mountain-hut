import { describe, expect, it } from "vitest";
import {
    CreateStaffReservationRequestSchema,
    SearchStaffHikersRequestSchema,
} from "../../models/dto/reservation-dto";

/*
UNIT tests for the DTOs of MH-07 "Reserve for a hiker" (an employee books a table for a hiker).
Covered: CreateStaffReservationRequestSchema (existing, temporary and registered hiker)
and SearchStaffHikersRequestSchema.
*/

const BASE = { date: "2030-06-15", slot: "12:00", partySize: 4 };
const EXISTING = { mode: "existing", hikerId: 7 };
const TEMPORARY = { mode: "temporary", fullname: "Paolo Verdi", mobile_number: "+39 340 111 2233" };
const REGISTERED = {
    mode: "registered",
    fullname: "Anna Neri",
    mobile_number: "+39 333 444 5555",
    email: "anna.neri@mountainhut.test",
    notes: "Arrives late",
    emergency_contact: "Luca Neri +39 333 000 0000",
};

const parse = (hiker: unknown, body: object = BASE) =>
    CreateStaffReservationRequestSchema.safeParse({ ...body, hiker });

describe("POST /reservations (staff) — CreateStaffReservationRequestSchema", () => {
    describe("common fields", () => {
        it("accepts a full body with requirements", () => {
            const body = {
                ...BASE,
                requirements: [{ hasAllergies: true, details: "1 peanut allergy" }],
                hiker: EXISTING,
            };

            expect(CreateStaffReservationRequestSchema.parse(body)).toEqual(body);
        });

        it.each(["date", "slot", "partySize"])("rejects a missing booking field: %s", (field) => {
            const body: Record<string, unknown> = { ...BASE };
            delete body[field];

            expect(parse(EXISTING, body).success).toBe(false);
        });

        it.each([
            { field: "date", value: "2030-02-30" },
            { field: "slot", value: "24:00" },
            { field: "partySize", value: 0 },
            { field: "requirements", value: [{ hasAllergies: true, details: "  " }] },
        ])("applies the hiker booking rules to $field", ({ field, value }) => {
            expect(parse(EXISTING, { ...BASE, [field]: value }).success).toBe(false);
        });

        it.each([undefined, null, {}, "existing", 7])("rejects a missing or invalid hiker: %j", (hiker) => {
            expect(parse(hiker).success).toBe(false);
        });

        it.each([undefined, "", "guest", "EXISTING"])("rejects an unknown hiker mode: %j", (mode) => {
            expect(parse({ ...EXISTING, mode }).success).toBe(false);
        });

        it("rejects unknown top-level fields", () => {
            expect(parse(EXISTING, { ...BASE, hikerId: 7 }).success).toBe(false);
        });
    });

    describe("existing hiker", () => {
        it("accepts a positive integer hikerId", () => {
            expect(parse(EXISTING).success).toBe(true);
        });

        it.each([undefined, 0, -1, 1.5, "7", null])("rejects an invalid hikerId: %j", (hikerId) => {
            expect(parse({ ...EXISTING, hikerId }).success).toBe(false);
        });

        it.each([
            { fullname: "Mario Rossi" },
            { email: "mario@mountainhut.test" },
        ])("rejects fields of another mode: %j", (extra) => {
            expect(parse({ ...EXISTING, ...extra }).success).toBe(false);
        });
    });

    describe("temporary hiker", () => {
        it("accepts and trims the fullname and mobile number", () => {
            const result = parse({ mode: "temporary", fullname: "  Paolo Verdi ", mobile_number: " +39 340 111 2233 " });

            expect(result.success && result.data.hiker).toEqual(TEMPORARY);
        });

        it("accepts a missing mobile number", () => {
            expect(parse({ mode: "temporary", fullname: "Paolo Verdi" }).success).toBe(true);
        });

        it.each([undefined, "", "   ", 42])("rejects a missing or blank fullname: %j", (fullname) => {
            expect(parse({ ...TEMPORARY, fullname }).success).toBe(false);
        });

        it.each(["", "   ", null])("rejects a blank or null mobile number: %j", (mobile_number) => {
            expect(parse({ ...TEMPORARY, mobile_number }).success).toBe(false);
        });

        it.each([
            { hikerId: 7 },
            { email: "paolo@mountainhut.test" },
        ])("rejects fields of another mode: %j", (extra) => {
            expect(parse({ ...TEMPORARY, ...extra }).success).toBe(false);
        });
    });

    describe("registered hiker", () => {
        it("accepts all the fields", () => {
            const result = parse(REGISTERED);

            expect(result.success && result.data.hiker).toEqual(REGISTERED);
        });

        it("accepts missing notes and emergency contact", () => {
            const { notes: _notes, emergency_contact: _contact, ...required } = REGISTERED;

            expect(parse(required).success).toBe(true);
        });

        it("trims and lowercases the email", () => {
            const result = parse({ ...REGISTERED, email: "  Anna.Neri@MountainHut.TEST " });

            expect(result.success && result.data.hiker).toMatchObject({ email: "anna.neri@mountainhut.test" });
        });

        it.each(["fullname", "mobile_number", "email"])("rejects a missing mandatory field: %s", (field) => {
            const hiker: Record<string, unknown> = { ...REGISTERED };
            delete hiker[field];

            expect(parse(hiker).success).toBe(false);
        });

        it.each(["fullname", "mobile_number"])("rejects a blank %s", (field) => {
            expect(parse({ ...REGISTERED, [field]: "   " }).success).toBe(false);
        });

        it.each(["", "anna", "anna@", "@mountainhut.test", "anna neri@mountainhut.test"])(
            "rejects an invalid email: %j",
            (email) => {
                expect(parse({ ...REGISTERED, email }).success).toBe(false);
            },
        );

        it.each(["notes", "emergency_contact"])("accepts %s of exactly 200 characters", (field) => {
            expect(parse({ ...REGISTERED, [field]: "a".repeat(200) }).success).toBe(true);
        });

        it.each(["notes", "emergency_contact"])("rejects %s longer than 200 characters", (field) => {
            expect(parse({ ...REGISTERED, [field]: "a".repeat(201) }).success).toBe(false);
        });

        it.each([
            { hikerId: 7 },
            { password: "secret" },
        ])("rejects unknown fields, including a staff-chosen password: %j", (extra) => {
            expect(parse({ ...REGISTERED, ...extra }).success).toBe(false);
        });
    });
});

describe("GET /accounts/hikers (staff) — SearchStaffHikersRequestSchema", () => {
    it.each([
        { name: "Rossi" },
        { phone: "300 123" },
        { email: "mario@mountainhut.test" },
        { name: "Mario", phone: "300", email: "mario@mountainhut.test" },
    ])("accepts at least one criterion: %j", (query) => {
        expect(SearchStaffHikersRequestSchema.safeParse(query).success).toBe(true);
    });

    it("trims the criteria and lowercases the email", () => {
        expect(SearchStaffHikersRequestSchema.parse({ name: " Rossi ", phone: " 300 ", email: " Mario@MountainHut.test " }))
            .toEqual({ name: "Rossi", phone: "300", email: "mario@mountainhut.test" });
    });

    it.each([{}, { name: undefined, phone: undefined, email: undefined }])(
        "rejects a query without criteria: %j",
        (query) => {
            const result = SearchStaffHikersRequestSchema.safeParse(query);

            expect(result.success).toBe(false);
            expect(result.error?.issues[0].message).toBe("Provide at least one of name, phone or email");
        },
    );

    it.each([{ name: "" }, { name: "   " }, { phone: " " }])("rejects a blank criterion: %j", (query) => {
        expect(SearchStaffHikersRequestSchema.safeParse(query).success).toBe(false);
    });

    it.each(["mario", "mario@", "Mario Rossi"])("rejects an invalid email: %j", (email) => {
        expect(SearchStaffHikersRequestSchema.safeParse({ email }).success).toBe(false);
    });

    it("rejects unknown query parameters", () => {
        expect(SearchStaffHikersRequestSchema.safeParse({ name: "Rossi", surname: "Mario" }).success).toBe(false);
    });
});
