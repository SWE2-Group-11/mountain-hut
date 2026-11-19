import { describe, expect, it } from "vitest";
import {
    AccountLoginRequestSchema,
    AccountRegistrationRequestSchema,
    AccountResponseDTO,
} from "../../models/dto/account-dto";

/*
UNIT tests for account-dto.
Covered: AccountRegistrationRequestSchema (POST /accounts), AccountLoginRequestSchema and AccountResponseDTO.
Expected results come from docs/api.md.
*/

const VALID = {
    fullname: "Mario Rossi",
    mobile_number: "+39 333 123 4567",
    email: "mario@mountainhut.test",
    password: "secret-pass",
    notes: "Vegetarian",
    emergency_contact: "Anna Rossi +39 333 000 0000",
};
const LOGIN = { email: "mario@mountainhut.test", password: "secret" };

const register = (body: unknown) => AccountRegistrationRequestSchema.safeParse(body);
const login = (body: unknown) => AccountLoginRequestSchema.safeParse(body);

describe("POST /accounts — AccountRegistrationRequestSchema", () => {
    describe("valid body", () => {
        it("accepts all the fields", () => {
            expect(AccountRegistrationRequestSchema.parse(VALID)).toEqual(VALID);
        });

        it("accepts missing notes and emergency contact", () => {
            const { notes: _notes, emergency_contact: _contact, ...required } = VALID;

            const result = register(required);

            expect(result.success && result.data).toEqual(required);
        });

        it("trims the text fields", () => {
            const result = register({
                ...VALID,
                fullname: "  Mario Rossi ",
                mobile_number: " +39 333 123 4567 ",
                notes: " Vegetarian  ",
                emergency_contact: "  Anna Rossi +39 333 000 0000 ",
            });

            expect(result.success && result.data).toEqual(VALID);
        });

        it("trims and lowercases the email", () => {
            // the email is case-insensitive for registration and login
            const result = register({ ...VALID, email: "  Mario@MountainHut.TEST " });

            expect(result.success && result.data.email).toBe("mario@mountainhut.test");
        });

        it("does not trim the password", () => {
            // spaces can be part of a password
            const result = register({ ...VALID, password: " secret-pass " });

            expect(result.success && result.data.password).toBe(" secret-pass ");
        });

        it("ignores any other field, such as role", () => {
            // a visitor must not be able to register as staff
            const result = register({ ...VALID, role: "warden", id: 1 });

            expect(result.success).toBe(true);
            expect(result.success && result.data).not.toHaveProperty("role");
            expect(result.success && result.data).not.toHaveProperty("id");
        });
    });

    describe("invalid body", () => {
        it.each([undefined, null, {}, "body"])("rejects a missing or invalid body: %j", (body) => {
            expect(register(body).success).toBe(false);
        });

        it.each(["fullname", "mobile_number", "email", "password"])("rejects a missing mandatory field: %s", (field) => {
            const body: Record<string, unknown> = { ...VALID };
            delete body[field];

            expect(register(body).success).toBe(false);
        });

        it.each(["fullname", "mobile_number"])("rejects a blank %s", (field) => {
            expect(register({ ...VALID, [field]: "   " }).success).toBe(false);
        });

        it.each(["fullname", "mobile_number", "email", "password"])("rejects a non-string %s", (field) => {
            expect(register({ ...VALID, [field]: 42 }).success).toBe(false);
        });

        it.each(["", "mario", "mario@", "@mountainhut.test", "mario rossi@mountainhut.test"])(
            "rejects an invalid email: %j",
            (email) => {
                expect(register({ ...VALID, email }).success).toBe(false);
            },
        );

        it("rejects an empty password", () => {
            expect(register({ ...VALID, password: "" }).success).toBe(false);
        });
    });

    describe("notes and emergency contact", () => {
        it.each(["notes", "emergency_contact"])("accepts %s of exactly 200 characters", (field) => {
            expect(register({ ...VALID, [field]: "a".repeat(200) }).success).toBe(true);
        });

        it.each(["notes", "emergency_contact"])("rejects %s longer than 200 characters", (field) => {
            expect(register({ ...VALID, [field]: "a".repeat(201) }).success).toBe(false);
        });

        it.each(["notes", "emergency_contact"])("counts the 200 characters of %s after trimming", (field) => {
            const result = register({ ...VALID, [field]: `  ${"a".repeat(200)}  ` });

            expect(result.success && result.data).toMatchObject({ [field]: "a".repeat(200) });
        });

        it.each(["notes", "emergency_contact"])("rejects a null %s", (field) => {
            // optional means "omitted", not null
            expect(register({ ...VALID, [field]: null }).success).toBe(false);
        });
    });
});

describe("POST /api/v1/session — AccountLoginRequestSchema", () => {
    it("accepts an email and a password", () => {
        expect(AccountLoginRequestSchema.parse(LOGIN)).toEqual(LOGIN);
    });

    it("trims and lowercases the email", () => {
        const result = login({ ...LOGIN, email: " Mario@MountainHut.TEST  " });

        expect(result.success && result.data.email).toBe("mario@mountainhut.test");
    });

    it("ignores any other field", () => {
        const result = login({ ...LOGIN, role: "warden" });

        expect(result.success && result.data).toEqual(LOGIN);
    });

    it.each(["email", "password"])("rejects a missing %s", (field) => {
        const body: Record<string, unknown> = { ...LOGIN };
        delete body[field];

        expect(login(body).success).toBe(false);
    });

    it.each(["", "mario", "mario@"])("rejects an invalid email: %j", (email) => {
        expect(login({ ...LOGIN, email }).success).toBe(false);
    });

    it("rejects an empty password", () => {
        expect(login({ ...LOGIN, password: "" }).success).toBe(false);
    });
});

describe("AccountResponseDTO", () => {
    it("keeps the account fields and password-change flag", () => {
        const dto = new AccountResponseDTO(7, "mario@mountainhut.test", "hiker", false);

        expect(dto).toEqual({ id: 7, email: "mario@mountainhut.test", role: "hiker", must_change_password: false });
    });

    it("exposes no other field", () => {
        // the response must never carry password data
        const dto = new AccountResponseDTO(1, "warden@mountainhut.test", "warden", true);

        expect(Object.keys(dto)).toEqual(["id", "email", "role", "must_change_password"]);
    });
});