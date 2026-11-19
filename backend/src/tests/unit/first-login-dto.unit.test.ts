import { describe, expect, it } from "vitest";
import {
    AccountRegistrationRequestSchema,
    AccountResponseDTO,
    ChangePasswordRequestSchema,
    ForgotPasswordRequestSchema,
    ResetPasswordRequestSchema,
} from "../../models/dto/account-dto";

/*
UNIT tests for the DTO layer of MH-171.
Covered: ChangePasswordRequestSchema, ForgotPasswordRequestSchema, ResetPasswordRequestSchema,
the new password length of AccountRegistrationRequestSchema and the must_change_password field of AccountResponseDTO.
Expected results come from docs/api.md (new passwords: 8 to 128 characters, different from the current one).
*/

const CURRENT = "initial-password-from-staff";
const NEW_PASSWORD = "my-new-password";
const ofLength = (n: number) => "p".repeat(n);

describe("PUT /accounts/current/password — ChangePasswordRequestSchema", () => {
    const change = (body: unknown) => ChangePasswordRequestSchema.safeParse(body);
    const VALID = { current_password: CURRENT, new_password: NEW_PASSWORD };

    it("accepts a current password and a different new password", () => {
        const result = change(VALID);

        expect(result.success && result.data).toEqual(VALID);
    });

    it.each([
        { label: "an empty body", body: {} },
        { label: "a missing current password", body: { new_password: NEW_PASSWORD } },
        { label: "an empty current password", body: { current_password: "", new_password: NEW_PASSWORD } },
        { label: "a missing new password", body: { current_password: CURRENT } },
        { label: "a numeric new password", body: { current_password: CURRENT, new_password: 12345678 } },
        { label: "a null current password", body: { current_password: null, new_password: NEW_PASSWORD } },
    ])("rejects $label", ({ body }) => {
        // Why: api.md - both fields are required
        expect(change(body).success).toBe(false);
    });

    it.each([
        { length: 7, accepted: false },
        { length: 8, accepted: true },
        { length: 128, accepted: true },
        { length: 129, accepted: false },
    ])("accepts a new password of $length characters: $accepted", ({ length, accepted }) => {
        // Why: api.md - new_password is 8 to 128 characters
        expect(change({ current_password: CURRENT, new_password: ofLength(length) }).success).toBe(accepted);
    });

    it("rejects a new password equal to the current one, on the new_password field", () => {
        // Why: api.md - new_password must be different from current_password
        const result = change({ current_password: NEW_PASSWORD, new_password: NEW_PASSWORD });

        expect(result.success).toBe(false);
        expect(result.error?.issues[0].path).toEqual(["new_password"]);
    });

    it("accepts a current password of any non-empty length", () => {
        // Why: the initial or old password may not follow the new length rules
        expect(change({ current_password: "x", new_password: NEW_PASSWORD }).success).toBe(true);
    });

    it("drops any other field, such as must_change_password", () => {
        // Why: the client must not be able to clear the flag by itself
        const result = change({ ...VALID, must_change_password: false, id: 1 });

        expect(result.success && result.data).toEqual(VALID);
    });
});

describe("POST /accounts/password-reset — ForgotPasswordRequestSchema", () => {
    const forgot = (body: unknown) => ForgotPasswordRequestSchema.safeParse(body);

    it("accepts a valid email and trims and lowercases it", () => {
        // Why: api.md - the email is case-insensitive
        const result = forgot({ email: "  Anna.Neri@MountainHut.TEST " });

        expect(result.success && result.data).toEqual({ email: "anna.neri@mountainhut.test" });
    });

    it.each([
        { label: "a missing email", body: {} },
        { label: "an empty email", body: { email: "" } },
        { label: "an invalid email", body: { email: "anna@" } },
        { label: "a non-string email", body: { email: 42 } },
    ])("rejects $label", ({ body }) => {
        // Why: api.md - 400 for a missing or invalid email
        expect(forgot(body).success).toBe(false);
    });
});

describe("POST /accounts/password-reset/confirm — ResetPasswordRequestSchema", () => {
    const reset = (body: unknown) => ResetPasswordRequestSchema.safeParse(body);
    const VALID = { token: "plain-reset-token", new_password: NEW_PASSWORD };

    it("accepts a token and a new password", () => {
        const result = reset(VALID);

        expect(result.success && result.data).toEqual(VALID);
    });

    it.each([
        { label: "a missing token", body: { new_password: NEW_PASSWORD } },
        { label: "an empty token", body: { token: "", new_password: NEW_PASSWORD } },
        { label: "a missing new password", body: { token: "plain-reset-token" } },
    ])("rejects $label", ({ body }) => {
        // Why: api.md - token and new_password are required
        expect(reset(body).success).toBe(false);
    });

    it.each([
        { length: 7, accepted: false },
        { length: 8, accepted: true },
        { length: 128, accepted: true },
        { length: 129, accepted: false },
    ])("accepts a new password of $length characters: $accepted", ({ length, accepted }) => {
        // Why: api.md - new_password is 8 to 128 characters
        expect(reset({ token: "plain-reset-token", new_password: ofLength(length) }).success).toBe(accepted);
    });
});

describe("POST /accounts — password length of AccountRegistrationRequestSchema", () => {
    const BODY = { fullname: "Anna Neri", mobile_number: "+39 333 444 5555", email: "anna.neri@mountainhut.test" };

    it.each([
        { length: 7, accepted: false },
        { length: 8, accepted: true },
        { length: 128, accepted: true },
        { length: 129, accepted: false },
    ])("accepts a password of $length characters: $accepted", ({ length, accepted }) => {
        // Why: api.md - password is 8 to 128 characters
        expect(AccountRegistrationRequestSchema.safeParse({ ...BODY, password: ofLength(length) }).success).toBe(accepted);
    });
});

describe("AccountResponseDTO — must_change_password", () => {
    it("carries the must_change_password flag", () => {
        // Why: api.md - the client learns from the account that the password must be changed
        expect(new AccountResponseDTO(7, "anna.neri@mountainhut.test", "hiker", true).must_change_password).toBe(true);
    });

    it("exposes only id, email, role and must_change_password", () => {
        // Why: the response must never carry password data
        expect(Object.keys(new AccountResponseDTO(7, "anna.neri@mountainhut.test", "hiker", false)))
            .toEqual(["id", "email", "role", "must_change_password"]);
    });
});
