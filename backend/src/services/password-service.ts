import crypto from "node:crypto";
import { PASSWORD_KEY_LENGTH } from "../config/config";

const SALT_LENGTH = 8; // bytes -> 16 hex characters
const RESET_TOKEN_LENGTH = 32; // bytes -> 43 base64url characters

/**
 * Hashes a password with scrypt and the given salt.
 * @returns The hash as a hex string.
 */
export const hashPassword = (password: string, salt: string): string =>
    crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("hex");

/**
 * Generates a random salt and hashes the password with it.
 * @returns The salt and the hash to store in the database.
 */
export const generatePasswordHash = (password: string): { salt: string; hash: string } => {
    const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
    return { salt, hash: hashPassword(password, salt) };
};

/**
 * Checks a password against a stored salt and hash in constant time.
 * @returns true if the password matches.
 */
export const verifyPassword = (password: string, salt: string, storedHash: string): boolean => {
    const expected = Buffer.from(storedHash, "hex");
    const actual = Buffer.from(hashPassword(password, salt), "hex");
    // timingSafeEqual throws if the lengths differ: check them first
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

/**
 * Generates the secret sent in a password reset link.
 * @returns A random, URL-safe token. Only its hash (hashResetToken) is stored.
 */
export const generateResetToken = (): string =>
    crypto.randomBytes(RESET_TOKEN_LENGTH).toString("base64url");

/**
 * Hashes a password reset token for storage and lookup. A plain SHA-256 is enough:
 * the token is random, so it cannot be guessed like a password.
 * @returns The hash as a 64-character hex string.
 */
export const hashResetToken = (token: string): string =>
    crypto.createHash("sha256").update(token).digest("hex");
