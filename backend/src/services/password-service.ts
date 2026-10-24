import crypto from "node:crypto";
import { PASSWORD_KEY_LENGTH } from "../config/config";

const SALT_LENGTH = 8; // bytes -> 16 hex characters

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