import crypto from "node:crypto";
import { db } from "../database/database";
import { Account } from "../models/entities/account";
import { PASSWORD_KEY_LENGTH } from "../config/config";
import { hashPassword } from "../services/password-service";

/**
 * Retrieves an account and checks its password.
 * @returns The Account if the credentials are valid, or null otherwise.
 */
export const getAccountByCredentials = (username: string, password: string): Account | null => {
    const sql = "SELECT id, username, salt, hash, role FROM account WHERE username = ?";
    const row = db.prepare<[string], Account>(sql).get(username);
    if (!row) {
        return null;
    }

    const account = new Account(row.id, row.username, row.salt, row.hash, row.role);
    const storedHash = Buffer.from(account.hash, "hex");
    const hashedPassword = Buffer.from(hashPassword(password, account.salt), "hex");

    // timingSafeEqual throws if the lengths differ: check them first
    if (storedHash.length !== hashedPassword.length || !crypto.timingSafeEqual(storedHash, hashedPassword)) {
        return null;
    }
    return account;
};