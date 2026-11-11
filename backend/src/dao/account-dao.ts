import crypto from "node:crypto";
import { db } from "../database/database";
import { Account, Hiker, Staff, StaffRole } from "../models/entities/account";
import { hashPassword } from "../services/password-service";

type AccountRow = { id: number; email: string; password_salt: string; password_hash: string; must_change_password: number };
type HikerRow = { full_name: string; mobile_number: string; notes: string | null; emergency_contact: string | null };
type StaffRow = { name: string; role: StaffRole };

/**
 * Retrieves an account and checks its password.
 * @returns A Hiker or Staff if the credentials are valid, or null otherwise.
 */
export const getAccountByCredentials = (email: string, password: string): Account | null => {
    const account = db
        .prepare<[string], AccountRow>("SELECT id, email, password_salt, password_hash, must_change_password FROM account WHERE email = ?")
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
        return new Hiker(account.id, account.email, account.password_salt, account.password_hash, account.must_change_password === 1,
            hiker.full_name, hiker.mobile_number, hiker.notes, hiker.emergency_contact);
    }

    const staff = db
        .prepare<[number], StaffRow>("SELECT name, role FROM staff WHERE account_id = ?")
        .get(account.id);
    if (staff) {
        return new Staff(account.id, account.email, account.password_salt, account.password_hash, account.must_change_password === 1,
            staff.name, staff.role);
    }

    // Neither hiker nor staff: violates the (t,e) rule
    throw new Error(`Account ${account.id} has no hiker or staff profile`);
};