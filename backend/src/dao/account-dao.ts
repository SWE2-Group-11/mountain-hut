import crypto from "node:crypto";
import { db, inTransaction } from "../database/database";
import { Account, Hiker, Staff, StaffRole } from "../models/entities/account";
import { generatePasswordHash, hashPassword } from "../services/password-service";

type AccountRow = { id: number; email: string; password_salt: string; password_hash: string };
type HikerRow = { full_name: string; mobile_number: string; notes: string | null; emergency_contact: string | null };
type StaffRow = { name: string; role: StaffRole };

/**
 * Retrieves an account and checks its password.
 * @returns A Hiker or Staff if the credentials are valid, or null otherwise.
 */
export const getAccountByCredentials = (email: string, password: string): Account | null => {
    const account = db
        .prepare<[string], AccountRow>("SELECT id, email, password_salt, password_hash FROM account WHERE email = ?")
        .get(email);
    if (!account) {
        return null;
    }

    const storedHash = Buffer.from(account.password_hash, "hex");
    const hashedPassword = Buffer.from(hashPassword(password, account.password_salt), "hex");

    // timingSafeEqual throws if the lengths differ: check them first
    if (storedHash.length !== hashedPassword.length || !crypto.timingSafeEqual(storedHash, hashedPassword)) {
        return null;
    }

    const hiker = db
        .prepare<[number], HikerRow>("SELECT full_name, mobile_number, notes, emergency_contact FROM hiker WHERE account_id = ?")
        .get(account.id);
    if (hiker) {
        return new Hiker(account.id, account.email, account.password_salt, account.password_hash,
            hiker.full_name, hiker.mobile_number, hiker.notes, hiker.emergency_contact);
    }

    const staff = db
        .prepare<[number], StaffRow>("SELECT name, role FROM staff WHERE account_id = ?")
        .get(account.id);
    if (staff) {
        return new Staff(account.id, account.email, account.password_salt, account.password_hash,
            staff.name, staff.role);
    }

    // Neither hiker nor staff: violates the (t,e) rule
    throw new Error(`Account ${account.id} has no hiker or staff profile`);
};

export type HikerInput = {
    email: string;
    password: string;
    full_name: string;
    mobile_number: string;
    notes: string | null;
    emergency_contact: string | null;
};

/**
 * Creates a hiker account with a freshly generated password salt.
 * Uses inTransaction to atomically read and write database
 * @returns The created Hiker, or null if the email is already registered.
 */
export const createHikerAccount = (input: HikerInput): Hiker | null => {
    const { email, password, full_name, mobile_number, notes, emergency_contact } = input;
    const { salt, hash } = generatePasswordHash(password);
    return inTransaction(() => {
        if (db.prepare<[string]>("SELECT 1 FROM account WHERE email = ?").get(email)) {
            return null;
        }
        const { lastInsertRowid } = db
            .prepare("INSERT INTO account (email, password_salt, password_hash) VALUES (?, ?, ?)")
            .run(email, salt, hash);
        const id = Number(lastInsertRowid);
        db.prepare<[number, string, string, string | null, string | null]>(
            "INSERT INTO hiker (account_id, full_name, mobile_number, notes, emergency_contact) VALUES (?, ?, ?, ?, ?)"
        ).run(id, full_name, mobile_number, notes, emergency_contact);
        return new Hiker(id, email, salt, hash, full_name, mobile_number, notes, emergency_contact);
    });
};
