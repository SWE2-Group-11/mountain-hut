import path from "node:path";

// Database
export const DB_FILE_PATH = process.env.DB_PATH ?? path.resolve(process.cwd(), "src/data/database.sqlite");

// Drop, recreate and seed the database at startup (default: false)
export const RESET_DB = process.env.RESET_DB === "true";

// Application URLs
const APP_V1_BASE_URL = "/api/v1";
const URL_AUTH = "/session";
const URL_TICKETS = "/tickets";
const URL_SERVICES = "/services";
const URL_COUNTERS = "/counters";

export const ROUTES = {
    V1_AUTH: `${APP_V1_BASE_URL}${URL_AUTH}`,
    V1_TICKETS: `${APP_V1_BASE_URL}${URL_TICKETS}`,
    V1_SERVICES: `${APP_V1_BASE_URL}${URL_SERVICES}`,
    V1_COUNTERS: `${APP_V1_BASE_URL}${URL_COUNTERS}`,
} as const;

// Server configuration
export const APP_PORT = Number(process.env.PORT) || 3000;

// Frontend allowed by CORS
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

// Session
export const SESSION_SECRET = "shhhhh... it's a secret!";

// Password hashing
export const PASSWORD_KEY_LENGTH = 16;

// Ticket numbers: after this value the daily sequence of a service restarts from 0
export const MAX_TICKET_NUMBER_PER_SERVICE = 999;