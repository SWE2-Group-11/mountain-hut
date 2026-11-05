import path from "node:path";

// Database
export const DB_FILE_PATH = process.env.DB_PATH ?? path.resolve(process.cwd(), "src/data/database.sqlite");

// Drop, recreate and seed the database at startup (default: false)
export const RESET_DB = process.env.RESET_DB === "true";

// Application URLs
const APP_V1_BASE_URL = "/api/v1";
const URL_AUTH = "/session";
const URL_RESERVATIONS = "/reservations";
const URL_SLOTS = "/slots";

export const ROUTES = {
    V1_AUTH: `${APP_V1_BASE_URL}${URL_AUTH}`,
    V1_RESERVATIONS: `${APP_V1_BASE_URL}${URL_RESERVATIONS}`,
    V1_SLOTS: `${APP_V1_BASE_URL}${URL_SLOTS}`,
} as const;

// Server configuration
export const APP_PORT = Number(process.env.PORT) || 3000;

// Frontend allowed by CORS
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

// Session
export const SESSION_SECRET = "shhhhh... it's a secret!";

// Password hashing
export const PASSWORD_KEY_LENGTH = 16;

// How many hours before the due time can be reserved a seat
export const BOOKING_CUTOFF_HOURS = 2;

// timezone in which the dates and start_time of the slots are expressed
export const HUT_TIMEZONE = "Europe/Rome"; 