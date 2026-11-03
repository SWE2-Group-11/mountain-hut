import request from "supertest";
import { DateTime } from "luxon";
import { app } from "../app";
import { db, resetDatabase } from "../database/database";
import { HUT_TIMEZONE } from "../config/config";

export const PASSWORD = "password";
export const MARIO = "mario@mountainhut.test";
export const LAURA = "laura@mountainhut.test";
export const EMPLOYEE = "employee@mountainhut.test";
export const NEW_HIKER = "new.hiker@mountainhut.test";

/** Drops, recreates and seeds the in-memory database (the seed is relative to "today"). */
export const resetTestDatabase = (): void => resetDatabase();

/** The seed creates slots from tomorrow: YYYY-MM-DD, same way SQLite computes "localtime +1 day". */
export const dayFromToday = (days: number): string =>
    DateTime.now().plus({ days }).toISODate()!;

/** A Date for the given wall-clock time of a day in the hut timezone. */
export const huTime = (date: string, time: string): Date =>
    DateTime.fromISO(`${date}T${time}`, { zone: HUT_TIMEZONE }).toJSDate();

/** Returns a supertest agent that keeps the session cookie after logging in. */
export const loginAs = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/api/v1/session").send({ email, password: PASSWORD });
    if (res.status !== 201) {
        throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return agent;
};

/**
 * Adds a hiker without bookings (the seeded hikers already have a 12:00 booking tomorrow).
 * It reuses Mario's password hash, so the password is the same.
 */
export const createHikerWithoutBookings = (email: string = NEW_HIKER): void => {
    const { lastInsertRowid } = db.prepare(
        `INSERT INTO account (email, password_salt, password_hash)
         SELECT ?, password_salt, password_hash FROM account WHERE email = ?`
    ).run(email, MARIO);
    db.prepare(
        `INSERT INTO hiker (account_id, full_name, mobile_number) VALUES (?, 'New Hiker', '+39 300 000 0000')`
    ).run(lastInsertRowid);
};