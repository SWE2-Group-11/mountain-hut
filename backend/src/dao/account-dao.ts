import crypto from "node:crypto";
import { db } from "../database/database";
import { Account } from "../models/entities/account";
import { hashPassword } from "../services/password-service";

/**
 * Retrieves an account and checks its password.
 * @returns The Account if the credentials are valid, or null otherwise.
 */
export const getAccountByCredentials = (email: string, password: string): Account | null => {
    const sql = "SELECT id, first_name, last_name, email, password_salt, password_hash, role FROM account WHERE email = ?";
    const row = db.prepare<[string], Account>(sql).get(email);
    if (!row) {
        return null;
    }

    const account = new Account(row.id, row.first_name, row.last_name, row.email, row.password_salt, row.password_hash, row.role);
    const storedHash = Buffer.from(account.password_hash, "hex");
    const hashedPassword = Buffer.from(hashPassword(password, account.password_salt), "hex");

    // timingSafeEqual throws if the lengths differ: check them first
    if (storedHash.length !== hashedPassword.length || !crypto.timingSafeEqual(storedHash, hashedPassword)) {
        return null;
    }
    return account;
};