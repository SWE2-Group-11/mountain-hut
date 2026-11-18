import { db, inTransaction } from "../database/database";
import { PasswordHash, setPasswordHash } from "./account-dao";

/** Formats a time as stored in password_reset_token: UTC to the second, e.g. "2026-11-17T09:30:00Z". */
const toTimestamp = (time: Date): string => `${time.toISOString().slice(0, 19)}Z`;

export type ResetTokenInput = {
    account_id: number;
    token_hash: string;   // hashResetToken of the emailed token
    created_at: Date;
    expires_at: Date;
};

/**
 * Stores a reset token, replacing the previous one of the account (only the newest link works).
 * Expired tokens of every account are removed on the way.
 * @param token The token to store.
 * @param cooldownStart A token of the account created after this time blocks the new one.
 * @returns false if the account received a token after cooldownStart (nothing is stored), true otherwise.
 */
export const issueResetToken = (token: ResetTokenInput, cooldownStart: Date): boolean => {
    const created = toTimestamp(token.created_at);
    return inTransaction(() => {
        db.prepare<[string]>("DELETE FROM password_reset_token WHERE expires_at <= ?").run(created);

        const recent = db
            .prepare<[number, string]>("SELECT 1 FROM password_reset_token WHERE account_id = ? AND created_at > ?")
            .get(token.account_id, toTimestamp(cooldownStart));
        if (recent) {
            return false;
        }

        db.prepare<[string, number, string, string]>(
            `INSERT INTO password_reset_token (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)
             ON CONFLICT (account_id) DO UPDATE
             SET token_hash = excluded.token_hash, created_at = excluded.created_at, expires_at = excluded.expires_at`
        ).run(token.token_hash, token.account_id, created, toTimestamp(token.expires_at));
        return true;
    });
};

/**
 * Redeems a reset token: if it exists and has not expired, sets the new password of its account
 * and deletes the token, so it can be used only once.
 * @param tokenHash hashResetToken of the token received by the client.
 * @param passwordHash The new password hash, computed before the call (scrypt is slow).
 * @param now The current time.
 * @returns false if the token is unknown, already used, replaced or expired.
 */
export const consumeResetToken = (tokenHash: string, passwordHash: PasswordHash, now: Date): boolean =>
    inTransaction(() => {
        const row = db
            .prepare<[string, string], { account_id: number }>(
                "SELECT account_id FROM password_reset_token WHERE token_hash = ? AND expires_at > ?")
            .get(tokenHash, toTimestamp(now));
        if (!row) {
            return false;
        }
        // Also deletes the token
        return setPasswordHash(row.account_id, passwordHash);
    });
