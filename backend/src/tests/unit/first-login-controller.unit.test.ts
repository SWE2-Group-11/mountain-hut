import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changePassword, requestPasswordReset, resetPassword } from "../../controllers/account-controller";
import { getAccountById, updatePassword } from "../../dao/account-dao";
import { getHikerByEmail } from "../../dao/hiker-dao";
import { consumeResetToken, issueResetToken } from "../../dao/password-reset-dao";
import { notifyPasswordResetRequested } from "../../notifications/password-reset";
import {
    generatePasswordHash,
    generateResetToken,
    hashResetToken,
    verifyPassword,
} from "../../services/password-service";
import { AccountResponseDTO } from "../../models/dto/account-dto";
import { Hiker, Staff } from "../../models/entities/account";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { NotFoundError } from "../../models/errors/notfound-error";
import { UnauthorizedError } from "../../models/errors/unauthorized-error";

/*
UNIT tests for the controller layer of MH-171.
Covered: changePassword (PUT /accounts/current/password), requestPasswordReset (POST /accounts/password-reset)
and resetPassword (POST /accounts/password-reset/confirm).
The DAOs, the password service and the email are mocked; the response mapping is the real one.
*/

vi.mock("../../dao/account-dao", () => ({
    createHikerAccount: vi.fn(),
    getAccountById: vi.fn(),
    updatePassword: vi.fn(),
}));
vi.mock("../../dao/hiker-dao", () => ({ getHikerByEmail: vi.fn() }));
vi.mock("../../dao/password-reset-dao", () => ({ issueResetToken: vi.fn(), consumeResetToken: vi.fn() }));
vi.mock("../../notifications/password-reset", () => ({ notifyPasswordResetRequested: vi.fn() }));
vi.mock("../../services/password-service", () => ({
    generatePasswordHash: vi.fn(),
    generateResetToken: vi.fn(),
    hashResetToken: vi.fn(),
    verifyPassword: vi.fn(),
}));

const ACCOUNT_ID = 7;
const EMAIL = "anna.neri@mountainhut.test";
const FULL_NAME = "Anna Neri";
const CURRENT = "initial-password-from-staff";
const NEW_PASSWORD = "my-new-password";
const PLAIN_TOKEN = "plain-reset-token";
const NEW_HASH = { salt: "new-salt", hash: "new-hash" };

// A hiker account created by staff, still with its initial password
const staffCreatedHiker = (mustChange = true) =>
    new Hiker(ACCOUNT_ID, EMAIL, "salt", "hash", mustChange, FULL_NAME, "+39 333 444 5555", null, null);

const boom = new Error("SQLITE_BUSY: database is locked");

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAccountById).mockReturnValue(staffCreatedHiker());
    vi.mocked(verifyPassword).mockReturnValue(true);
    vi.mocked(updatePassword).mockReturnValue(true);
    vi.mocked(generatePasswordHash).mockReturnValue(NEW_HASH);
    vi.mocked(generateResetToken).mockReturnValue(PLAIN_TOKEN);
    vi.mocked(hashResetToken).mockImplementation((token) => `sha256(${token})`);
});

afterEach(() => vi.useRealTimers());

describe("PUT /accounts/current/password — changePassword controller", () => {
    it("saves the new password for the logged-in account", () => {
        // Why: api.md - changes the password of the logged-in account
        changePassword(ACCOUNT_ID, { current_password: CURRENT, new_password: NEW_PASSWORD });

        expect(getAccountById).toHaveBeenCalledExactlyOnceWith(ACCOUNT_ID);
        expect(updatePassword).toHaveBeenCalledExactlyOnceWith(ACCOUNT_ID, NEW_PASSWORD);
    });

    it("checks the current password against the stored salt and hash", () => {
        // Why: api.md - a wrong current_password must be refused
        changePassword(ACCOUNT_ID, { current_password: CURRENT, new_password: NEW_PASSWORD });

        expect(verifyPassword).toHaveBeenCalledExactlyOnceWith(CURRENT, "salt", "hash");
    });

    it("returns the account with must_change_password false after the first-login change", () => {
        // Why: api.md - 200 returns id, email, role and must_change_password (false)
        const response = changePassword(ACCOUNT_ID, { current_password: CURRENT, new_password: NEW_PASSWORD });

        expect(response).toBeInstanceOf(AccountResponseDTO);
        expect(response).toEqual(new AccountResponseDTO(ACCOUNT_ID, EMAIL, "hiker", false));
    });

    it("also works for an account that does not have to change the password", () => {
        // Why: api.md - the endpoint is for every logged-in account, not only the first login
        vi.mocked(getAccountById).mockReturnValue(staffCreatedHiker(false));

        const response = changePassword(ACCOUNT_ID, { current_password: CURRENT, new_password: NEW_PASSWORD });

        expect(updatePassword).toHaveBeenCalledTimes(1);
        expect(response.must_change_password).toBe(false);
    });

    it("works for a staff account with the staff role", () => {
        vi.mocked(getAccountById).mockReturnValue(new Staff(ACCOUNT_ID, EMAIL, "salt", "hash", true, "Paolo", "employee"));

        const response = changePassword(ACCOUNT_ID, { current_password: CURRENT, new_password: NEW_PASSWORD });

        expect(response).toEqual(new AccountResponseDTO(ACCOUNT_ID, EMAIL, "employee", false));
    });

    it("throws UnauthorizedError and saves nothing when the current password is wrong", () => {
        // Why: api.md - 401 if current_password is wrong
        vi.mocked(verifyPassword).mockReturnValue(false);

        expect(() => changePassword(ACCOUNT_ID, { current_password: "wrong", new_password: NEW_PASSWORD }))
            .toThrow(UnauthorizedError);
        expect(updatePassword).not.toHaveBeenCalled();
    });

    it("throws NotFoundError and saves nothing when the account no longer exists", () => {
        vi.mocked(getAccountById).mockReturnValue(null);

        expect(() => changePassword(ACCOUNT_ID, { current_password: CURRENT, new_password: NEW_PASSWORD }))
            .toThrow(NotFoundError);
        expect(updatePassword).not.toHaveBeenCalled();
    });

    it("throws NotFoundError when the account is deleted before the update", () => {
        vi.mocked(updatePassword).mockReturnValue(false);

        expect(() => changePassword(ACCOUNT_ID, { current_password: CURRENT, new_password: NEW_PASSWORD }))
            .toThrow(NotFoundError);
    });

    it("returns no password data", () => {
        // Why: the result goes into the session and to the client
        const response = changePassword(ACCOUNT_ID, { current_password: CURRENT, new_password: NEW_PASSWORD });

        expect(response).not.toHaveProperty("password_salt");
        expect(response).not.toHaveProperty("password_hash");
        expect(JSON.stringify(response)).not.toContain(NEW_PASSWORD);
    });

    it("lets a DAO failure through instead of swallowing it", () => {
        vi.mocked(updatePassword).mockImplementation(() => {
            throw boom;
        });

        expect(() => changePassword(ACCOUNT_ID, { current_password: CURRENT, new_password: NEW_PASSWORD })).toThrow(boom);
    });
});

describe("POST /accounts/password-reset — requestPasswordReset controller", () => {
    const NOW = "2026-11-19T09:30:00.000Z";
    const HIKER_PROFILE = { id: ACCOUNT_ID, booking_id: null, full_name: FULL_NAME, mobile_number: "+39 333 444 5555", email: EMAIL };

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(NOW));
        vi.mocked(getHikerByEmail).mockReturnValue(HIKER_PROFILE);
        vi.mocked(issueResetToken).mockReturnValue(true);
    });

    it("stores a reset link that expires 24 hours after the request", () => {
        // Why: requirement - the typical expiration time for email reset links is 24 hours
        requestPasswordReset(EMAIL);

        const [token] = vi.mocked(issueResetToken).mock.calls[0];
        expect(token.account_id).toBe(ACCOUNT_ID);
        expect(token.created_at).toEqual(new Date(NOW));
        expect(token.expires_at).toEqual(new Date("2026-11-20T09:30:00.000Z"));
    });

    it("asks the DAO to refuse a new link if one was sent in the last 5 minutes", () => {
        // Why: api.md - a new email is sent at most every 5 minutes per account
        requestPasswordReset(EMAIL);

        const [, cooldownStart] = vi.mocked(issueResetToken).mock.calls[0];
        expect(cooldownStart).toEqual(new Date("2026-11-19T09:25:00.000Z"));
    });

    it("stores only the hash of the token, never the token itself", () => {
        // Why: database.md - token_hash is the SHA-256 of the emailed token, never the token itself
        requestPasswordReset(EMAIL);

        const [token] = vi.mocked(issueResetToken).mock.calls[0];
        expect(hashResetToken).toHaveBeenCalledWith(PLAIN_TOKEN);
        expect(token.token_hash).toBe(`sha256(${PLAIN_TOKEN})`);
        expect(JSON.stringify(vi.mocked(issueResetToken).mock.calls)).not.toContain(`"${PLAIN_TOKEN}"`);
    });

    it("emails the plain token to the hiker's address and name", () => {
        // Why: requirement - the hiker can recover the password via email
        requestPasswordReset(EMAIL);

        expect(notifyPasswordResetRequested).toHaveBeenCalledExactlyOnceWith({ email: EMAIL, full_name: FULL_NAME }, PLAIN_TOKEN);
    });

    it("looks the hiker up by the given email", () => {
        requestPasswordReset(EMAIL);

        expect(getHikerByEmail).toHaveBeenCalledExactlyOnceWith(EMAIL);
    });

    it("does nothing, without an error, when no hiker has this email", () => {
        // Why: api.md - same answer whether or not the email is registered (staff emails included)
        vi.mocked(getHikerByEmail).mockReturnValue(null);

        expect(() => requestPasswordReset("nobody@mountainhut.test")).not.toThrow();
        expect(issueResetToken).not.toHaveBeenCalled();
        expect(notifyPasswordResetRequested).not.toHaveBeenCalled();
    });

    it("sends no email, without an error, during the 5-minute cooldown", () => {
        // Why: api.md - at most one email every 5 minutes, and the caller is not told
        vi.mocked(issueResetToken).mockReturnValue(false);

        expect(() => requestPasswordReset(EMAIL)).not.toThrow();
        expect(notifyPasswordResetRequested).not.toHaveBeenCalled();
    });

    it("lets a DAO failure through instead of swallowing it", () => {
        vi.mocked(issueResetToken).mockImplementation(() => {
            throw boom;
        });

        expect(() => requestPasswordReset(EMAIL)).toThrow(boom);
        expect(notifyPasswordResetRequested).not.toHaveBeenCalled();
    });
});

describe("POST /accounts/password-reset/confirm — resetPassword controller", () => {
    const NOW = "2026-11-19T10:00:00.000Z";

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(NOW));
        vi.mocked(consumeResetToken).mockReturnValue(true);
    });

    it("redeems the token by its hash with the hash of the new password and the current time", () => {
        // Why: api.md - sets a new password with the token of a reset email
        resetPassword({ token: PLAIN_TOKEN, new_password: NEW_PASSWORD });

        expect(generatePasswordHash).toHaveBeenCalledExactlyOnceWith(NEW_PASSWORD);
        expect(consumeResetToken).toHaveBeenCalledExactlyOnceWith(`sha256(${PLAIN_TOKEN})`, NEW_HASH, new Date(NOW));
    });

    it("never gives the plain token or the plain password to the DAO", () => {
        // Why: database.md - only hashes are stored
        resetPassword({ token: PLAIN_TOKEN, new_password: NEW_PASSWORD });

        const args = JSON.stringify(vi.mocked(consumeResetToken).mock.calls);
        expect(args).not.toContain(`"${PLAIN_TOKEN}"`);
        expect(args).not.toContain(NEW_PASSWORD);
    });

    it("throws BadRequestError for an unknown, used, replaced or expired token", () => {
        // Why: api.md - 400 if the token is unknown, already used, replaced by a newer link or expired
        vi.mocked(consumeResetToken).mockReturnValue(false);

        expect(() => resetPassword({ token: PLAIN_TOKEN, new_password: NEW_PASSWORD })).toThrow(BadRequestError);
        expect(() => resetPassword({ token: PLAIN_TOKEN, new_password: NEW_PASSWORD })).toThrow("Invalid or expired reset link");
    });

    it("lets a DAO failure through instead of swallowing it", () => {
        vi.mocked(consumeResetToken).mockImplementation(() => {
            throw boom;
        });

        expect(() => resetPassword({ token: PLAIN_TOKEN, new_password: NEW_PASSWORD })).toThrow(boom);
    });
});
