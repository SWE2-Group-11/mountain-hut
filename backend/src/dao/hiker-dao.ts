import { db } from "../database/database";

export type HikerSearchFilter = {
    name?: string
    phone?:string
    email?: string
}

export type HikerProfile = {
    id: number | null;          // account id; null for temporary hikers
    booking_id: number | null;  // set only for temporary hikers
    full_name: string;
    mobile_number: string | null;
    email: string | null;
};

const HIKER_SELECT = `SELECT h.account_id AS id, NULL AS booking_id, h.full_name, h.mobile_number, a.email
                      FROM hiker h
                      JOIN account a ON a.id = h.account_id`;

// Escapes LIKE wildcards so user input is matched literally
const likePattern = (value: string): string => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

/**
 * Retrieves a registered hiker.
 * @returns The hiker, or null if it does not exist.
 */
export const getHikerById = (id: number): HikerProfile | null =>
    db.prepare<[number], HikerProfile>(`${HIKER_SELECT} WHERE h.account_id = ?`).get(id) ?? null;

/**
 * Retrieves a registered hiker by the email of its account (stored lowercase).
 * @returns The hiker, or null if no hiker account has this email (staff accounts are never returned).
 */

// I preferred adding this new function instead of using searchHikersFilter to prevent breakage when
// switching searching criteria (eg exact email match -> partial email match)
export const getHikerByEmail = (email: string): HikerProfile | null =>
    db.prepare<[string], HikerProfile>(`${HIKER_SELECT} WHERE a.email = ?`).get(email) ?? null;

/**
 * Searches registered and temporary hikers; the given criteria are combined with AND.
 * Name and phone are partial matches (phone ignores spaces), email is an exact match
 * and therefore only matches registered hikers.
 * @returns At most 50 hikers ordered by name. A temporary hiker is identified by its booking_id.
 */
export const searchHikersFilter = ({ name, phone, email }: HikerSearchFilter): HikerProfile[] => {
    const sql = `
        SELECT h.account_id AS id, NULL AS booking_id, h.full_name, h.mobile_number, a.email
        FROM hiker h
        JOIN account a ON a.id = h.account_id
        WHERE (@name  IS NULL OR h.full_name LIKE @name ESCAPE '\\')
          AND (@phone IS NULL OR REPLACE(h.mobile_number, ' ', '') LIKE @phone ESCAPE '\\')
          AND (@email IS NULL OR a.email = @email)
        UNION ALL
        SELECT NULL, t.booking_id, t.full_name, t.mobile_number, NULL
        FROM temporary_hiker t
        WHERE @email IS NULL
          AND (@name  IS NULL OR t.full_name LIKE @name ESCAPE '\\')
          AND (@phone IS NULL OR REPLACE(t.mobile_number, ' ', '') LIKE @phone ESCAPE '\\')
        ORDER BY full_name, id, booking_id
        LIMIT 50`;
    return db
        .prepare<{ name: string | null; phone: string | null; email: string | null }, HikerProfile>(sql)
        .all({
            name: name ? likePattern(name) : null,
            phone: phone ? likePattern(phone.replace(/\s/g, "")) : null,
            email: email ?? null,
        });
};