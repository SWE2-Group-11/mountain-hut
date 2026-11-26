import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Reads a required environment variable (set in .env, see .env.example).
 * @throws Error if it is missing or empty, so the server never starts without it.
 */
const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable ${name}: copy .env.example to .env and set it`);
    }
    return value;
};

// Database
export const DB_FILE_PATH = process.env.DB_PATH ?? path.resolve(process.cwd(), "src/data/database.sqlite");

// Drop, recreate and seed the database at startup (default: false; an empty database is always seeded)
export const RESET_DB = process.env.RESET_DB === "true";

// Application URLs
const APP_V1_BASE_URL = "/api/v1";
const URL_AUTH = "/session";
const URL_ACCOUNTS = "/accounts";
const URL_RESERVATIONS = "/reservations";
const URL_SLOTS = "/slots";

export const ROUTES = {
    V1_AUTH: `${APP_V1_BASE_URL}${URL_AUTH}`,
    V1_ACCOUNTS: `${APP_V1_BASE_URL}${URL_ACCOUNTS}`,
    V1_RESERVATIONS: `${APP_V1_BASE_URL}${URL_RESERVATIONS}`,
    V1_SLOTS: `${APP_V1_BASE_URL}${URL_SLOTS}`,
} as const;

// Server configuration
export const APP_PORT = Number(process.env.PORT) || 3000;

// Frontend allowed by CORS
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

// Session: signs the session cookie
export const SESSION_SECRET = requireEnv("SESSION_SECRET");

// Password hashing
export const PASSWORD_KEY_LENGTH = 16;

// Length limits of a password chosen at registration, change or reset (not applied at login,
// so accounts created before a stricter limit can still log in)
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Password reset by email: link lifetime, minimum wait between two emails, and frontend page the link opens
export const PASSWORD_RESET_TTL_HOURS = 24;
export const PASSWORD_RESET_COOLDOWN_MINUTES = 5;
export const PASSWORD_RESET_URL = `${CLIENT_ORIGIN}/reset-password`;

// How many hours before the due time can be reserved a seat
export const BOOKING_CUTOFF_HOURS = 2;

// How many hours before the due time can be changed a reservation
export const CHANGE_BOOKING_CUTOFF_HOURS = 48;

// timezone in which the dates and start_time of the slots are expressed
export const HUT_TIMEZONE = "Europe/Rome"; 

// Demo accounts file
export const SEED_ACCOUNTS_FILE = process.env.SEED_ACCOUNTS_FILE
    ?? path.resolve(process.cwd(), "../seed-accounts.json");

// Demo slots and bookings: "random" for the app, "fixed" (the layout the tests rely on) for the tests
export const SEED_MODE: "random" | "fixed" =
    process.env.SEED_MODE === "fixed" ? "fixed" : "random";

// Seed of the random demo data (SEED_MODE=random): the same seed recreates the same data.
// If not set, a random one is used and printed at startup.
export const SEED_RANDOM_SEED = process.env.SEED_RANDOM_SEED || randomUUID();