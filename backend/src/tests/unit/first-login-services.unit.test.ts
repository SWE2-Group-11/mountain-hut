import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireAuthenticated, requireRole } from "../../services/auth-service";
import { accountEntityToResponseDTO } from "../../services/mapper-service";
import {
    generatePasswordHash,
    generateResetToken,
    hashResetToken,
    verifyPassword,
} from "../../services/password-service";
import { Hiker, Staff } from "../../models/entities/account";

/*
UNIT tests for the services of MH-171.
Covered: requireAuthenticated and the must_change_password check of requireRole (auth-service),
the flag copied into the login response by accountEntityToResponseDTO (mapper-service),
verifyPassword, generateResetToken and hashResetToken (password-service).
Request and response are fakes; hashing is real.
*/

vi.mock("../../dao/account-dao", () => ({ getAccountByCredentials: vi.fn() }));

const fakeRes = () => {
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
};

const fakeReq = (user?: Partial<Express.User>) =>
    ({ isAuthenticated: () => user !== undefined, user }) as unknown as Request;

let res: ReturnType<typeof fakeRes>;
let next: NextFunction;

beforeEach(() => {
    res = fakeRes();
    next = vi.fn();
});

describe("requireAuthenticated (unit)", () => {
    it("answers 401 to a visitor and stops the request", () => {
        // Why: api.md - the password change requires authentication
        requireAuthenticated(fakeReq(), res as unknown as Response, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 401, name: "UnauthorizedError" }));
        expect(next).not.toHaveBeenCalled();
    });

    it("lets through an account that must change the password", () => {
        // Why: api.md - allowed even while must_change_password is true
        requireAuthenticated(fakeReq({ id: 7, role: "hiker", must_change_password: true }), res as unknown as Response, next);

        expect(next).toHaveBeenCalledExactlyOnceWith();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("lets through an account that does not have to change the password", () => {
        requireAuthenticated(fakeReq({ id: 7, role: "warden", must_change_password: false }), res as unknown as Response, next);

        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe("requireRole: must_change_password (unit)", () => {
    it.each(["hiker", "employee", "warden"] as const)(
        "answers 403 Password change required to a %s with the right role who must change the password",
        (role) => {
            // Why: api.md - every other route answers 403 ("Password change required") until the change
            requireRole(role)(fakeReq({ id: 7, role, must_change_password: true }), res as unknown as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ code: 403, name: "ForbiddenError", message: "Password change required" });
            expect(next).not.toHaveBeenCalled();
        });

    it("lets through the same account once the flag is false", () => {
        requireRole("hiker")(fakeReq({ id: 7, role: "hiker", must_change_password: false }), res as unknown as Response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it("answers 403 to an account with another role that must change the password", () => {
        // Why: blocked either way; only the status is part of the contract here
        requireRole("employee", "warden")(fakeReq({ id: 7, role: "hiker", must_change_password: true }), res as unknown as Response, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it("still answers 401, not 403, to a visitor", () => {
        // Why: api.md - 401 if not authenticated
        requireRole("hiker")(fakeReq(), res as unknown as Response, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

describe("accountEntityToResponseDTO: login response (unit)", () => {
    it("copies must_change_password true for an account created by staff", () => {
        // Why: api.md - accounts created by staff have must_change_password: true in the login response
        const hiker = new Hiker(7, "anna.neri@mountainhut.test", "salt", "hash", true, "Anna Neri", "+39 333 444 5555", null, null);

        expect(accountEntityToResponseDTO(hiker)).toEqual({
            id: 7, email: "anna.neri@mountainhut.test", role: "hiker", must_change_password: true,
        });
    });

    it("copies must_change_password false for an account that chose its own password", () => {
        const staff = new Staff(2, "employee@mountainhut.test", "salt", "hash", false, "Paolo Verdi", "employee");

        expect(accountEntityToResponseDTO(staff).must_change_password).toBe(false);
    });

    it("leaves out the salt and the hash", () => {
        // Why: the login response and the session must never carry password data
        const hiker = new Hiker(7, "anna.neri@mountainhut.test", "salt", "hash", true, "Anna Neri", "+39 333 444 5555", null, null);

        const dto = accountEntityToResponseDTO(hiker);

        expect(dto).not.toHaveProperty("password_salt");
        expect(dto).not.toHaveProperty("password_hash");
    });
});

describe("verifyPassword (unit)", () => {
    const { salt, hash } = generatePasswordHash("initial-password-from-staff");

    it("accepts the right password", () => {
        expect(verifyPassword("initial-password-from-staff", salt, hash)).toBe(true);
    });

    it("refuses a wrong password", () => {
        // Why: api.md - a wrong current_password gives 401
        expect(verifyPassword("wrong-password", salt, hash)).toBe(false);
    });

    it("refuses, without throwing, a stored hash of a different length", () => {
        // Why: timingSafeEqual throws on buffers of different length
        expect(() => verifyPassword("initial-password-from-staff", salt, "abcd")).not.toThrow();
        expect(verifyPassword("initial-password-from-staff", salt, "abcd")).toBe(false);
    });
});

describe("generateResetToken (unit)", () => {
    it("returns a URL-safe token of 43 characters", () => {
        // Why: api.md - the token goes in the query string of the reset link
        expect(generateResetToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("returns a different token every time", () => {
        // Why: a guessable token would let anyone reset someone else's password
        const tokens = new Set(Array.from({ length: 20 }, () => generateResetToken()));

        expect(tokens.size).toBe(20);
    });
});

describe("hashResetToken (unit)", () => {
    it("returns a 64-character hex hash that differs from the token", () => {
        // Why: database.md - token_hash is the hex SHA-256 of the emailed token, never the token itself
        const token = generateResetToken();

        const hashed = hashResetToken(token);

        expect(hashed).toMatch(/^[0-9a-f]{64}$/);
        expect(hashed).not.toBe(token);
    });

    it("gives the same hash for the same token and different hashes for different tokens", () => {
        // Why: the token in the link must find its stored row, and only that one
        expect(hashResetToken("token-a")).toBe(hashResetToken("token-a"));
        expect(hashResetToken("token-a")).not.toBe(hashResetToken("token-b"));
    });
});
