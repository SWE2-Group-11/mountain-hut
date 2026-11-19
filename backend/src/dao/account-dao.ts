import { db, inTransaction } from "../database/database";
import { Account, Hiker, Staff, StaffRole } from "../models/entities/account";
import { generatePasswordHash, verifyPassword } from "../services/password-service";

type AccountRow = { id: number; email: string; password_salt: string; password_hash: string; must_change_password: number };
type HikerRow = { full_name: string; mobile_number: string; notes: string | null; emergency_contact: string | null };
type StaffRow = { name: string; role: StaffRole };

const ACCOUNT_SELECT = "SELECT id, email, password_salt, password_hash, must_change_password FROM account";

/**
 * Completes an account row with its hiker or staff profile.
 * @throws Error if the account has neither profile.
 */
const toAccount = (account: AccountRow): Account => {
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

/**
 * Retrieves an account and checks its password.
 * @returns A Hiker or Staff if the credentials are valid, or null otherwise.
 */
export const getAccountByCredentials = (email: string, password: string): Account | null => {
    const account = db.prepare<[string], AccountRow>(`${ACCOUNT_SELECT} WHERE email = ?`).get(email);
    if (!account || !verifyPassword(password, account.password_salt, account.password_hash)) {
        return null;
    }
    return toAccount(account);
};

/**
 * Retrieves an account by its id.
 * @returns A Hiker or Staff, or null if the account does not exist.
 */
export const getAccountById = (id: number): Account | null => {
    const account = db.prepare<[number], AccountRow>(`${ACCOUNT_SELECT} WHERE id = ?`).get(id);
    return account ? toAccount(account) : null;
};

export type PasswordHash = { salt: string; hash: string };

/**
 * Stores a new password hash, clears the "must change password" flag and invalidates
 * every pending reset link of the account, in one transaction.
 * @param passwordHash The salt and hash from generatePasswordHash, computed outside the transaction (scrypt is slow).
 * @returns false if the account does not exist.
 */
export const setPasswordHash = (accountId: number, { salt, hash }: PasswordHash): boolean =>
    inTransaction(() => {
        const { changes } = db
            .prepare<[string, string, number]>(
                "UPDATE account SET password_salt = ?, password_hash = ?, must_change_password = 0 WHERE id = ?")
            .run(salt, hash, accountId);
        db.prepare<[number]>("DELETE FROM password_reset_token WHERE account_id = ?").run(accountId);
        return changes > 0;
    });

/**
 * Replaces the password of an account (see setPasswordHash).
 * @returns false if the account does not exist.
 */
export const updatePassword = (accountId: number, newPassword: string): boolean =>
    setPasswordHash(accountId, generatePasswordHash(newPassword));

export type HikerInput = {
    email: string;
    password: string;
    full_name: string;
    mobile_number: string;
    notes: string | null;
    emergency_contact: string | null;
    must_change_password?: boolean;
};

/**
 * Creates a hiker account with a freshly generated password salt.
 * Uses inTransaction to atomically read and write database
 * @returns The created Hiker, or null if the email is already registered.
 */
export const createHikerAccount = (input: HikerInput): Hiker | null => {
    const { email, password, full_name, mobile_number, notes, emergency_contact, must_change_password = false } = input;
    const { salt, hash } = generatePasswordHash(password);
    return inTransaction(() => {
        if (db.prepare<[string]>("SELECT 1 FROM account WHERE email = ?").get(email)) {
            return null;
        }
        const { lastInsertRowid } = db
            .prepare("INSERT INTO account (email, password_salt, password_hash, must_change_password) VALUES (?, ?, ?, ?)")
            .run(email, salt, hash, must_change_password ? 1 : 0);
        const id = Number(lastInsertRowid);
        db.prepare<[number, string, string, string | null, string | null]>(
            "INSERT INTO hiker (account_id, full_name, mobile_number, notes, emergency_contact) VALUES (?, ?, ?, ?, ?)"
        ).run(id, full_name, mobile_number, notes, emergency_contact);
        return new Hiker(id, email, salt, hash, must_change_password, full_name, mobile_number, notes, emergency_contact);
    });
};
