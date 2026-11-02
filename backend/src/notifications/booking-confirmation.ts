import Database from "better-sqlite3";
import { db as appDb } from "../database/database";
import { MAIL_FROM, SMTP_HOST, SMTP_PORT } from "../config/mail-config";
import { createNodemailerSender, MailSender } from "./mail-sender";
import { BookingConfirmationData, renderBookingConfirmation } from "./booking-confirmation-template";

export type BookingConfirmationDeps = {
    db: Database.Database;
    sender: MailSender;
    from: string;
};

export type BookingConfirmation = {
    to: string;
    data: BookingConfirmationData;
};

type BookingRow = {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    slot_date: string;
    slot_start_time: string;
    duration: number;
    party_size: number;
};

type RequirementRow = { allergy_flag: number; description: string };

// Slot dates are the hut's wall-clock dates: formatting them in UTC keeps the server's time zone from shifting the day
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
});

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Formats a booking ID as the reference shown to the hiker, e.g. 123 → "MH-000123".
 */
export const formatBookingReference = (id: number): string => `MH-${String(id).padStart(6, "0")}`;

/**
 * Formats a stored slot date, e.g. "2026-11-07" → "Sat 7 Nov 2026".
 * @param date The day of the slot (YYYY-MM-DD).
 */
export const formatSlotDate = (date: string): string => {
    const [year, month, day] = date.split("-").map(Number);
    // Built from the parts: the punctuation of the plain format differs between ICU versions
    const parts = DATE_FORMAT.formatToParts(new Date(Date.UTC(year, month - 1, day)));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
    return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}`;
};

/**
 * Formats a slot as start–end time, e.g. ("12:00", 60) → "12:00–13:00".
 * @param start_time The start time of the slot (HH:MM).
 * @param duration The length of the slot in minutes.
 */
export const formatSlot = (start_time: string, duration: number): string => {
    const [hours, minutes] = start_time.split(":").map(Number);
    const end = (hours * 60 + minutes + duration) % (24 * 60);
    return `${start_time}–${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
};

// TODO: move to a requirements DAO once MH-60 adds one
const getRequirements = (db: Database.Database, bookingId: number): BookingConfirmationData["requirements"] => {
    try {
        const sql = "SELECT allergy_flag, description FROM dietary_requirement WHERE booking_id = ? ORDER BY id";
        return db
            .prepare<[number], RequirementRow>(sql)
            .all(bookingId)
            .map((r) => ({ allergies: r.allergy_flag === 1, description: r.description }));
    } catch (err) {
        // The requirements table belongs to MH-60 and may not exist in every database yet
        if (err instanceof Error && err.message.includes("no such table")) return [];
        throw err;
    }
};

/**
 * Collects everything the confirmation email needs. Read-only.
 * TODO: move the booking query to booking-dao.ts once the DAO offers it.
 * @param db The database to read from.
 * @param bookingId The ID of a committed booking.
 * @returns The recipient and the formatted email data, or null if the booking does not exist or has no seats.
 */
export const buildBookingConfirmationData = (db: Database.Database, bookingId: number): BookingConfirmation | null => {
    // All seated_at rows of a booking refer to the same slot, so any row gives its date and start time
    const sql = `
        SELECT b.id, a.first_name, a.last_name, a.email,
               sa.slot_date, sa.slot_start_time, s.duration,
               SUM(sa.assigned_seats) AS party_size
        FROM booking b
        JOIN account a ON a.id = b.hiker_id
        JOIN seated_at sa ON sa.booking_id = b.id
        JOIN slot s ON s.date = sa.slot_date AND s.start_time = sa.slot_start_time
        WHERE b.id = ?
        GROUP BY b.id`;
    const row = db.prepare<[number], BookingRow>(sql).get(bookingId);
    if (!row) return null;

    return {
        to: row.email,
        data: {
            bookingReference: formatBookingReference(row.id),
            hikerName: `${row.first_name} ${row.last_name}`,
            date: formatSlotDate(row.slot_date),
            slot: formatSlot(row.slot_start_time, row.duration),
            partySize: row.party_size,
            requirements: getRequirements(db, row.id),
        },
    };
};

/**
 * Builds, renders and sends the confirmation email of a booking.
 * @param bookingId The ID of a committed booking.
 * @param deps The database, the sender and the "from" address.
 * @returns true if the email was handed to the sender, false if it was skipped.
 * @throws If the database read or the sender fails.
 */
export const sendBookingConfirmation = async (bookingId: number, { db, sender, from }: BookingConfirmationDeps): Promise<boolean> => {
    const confirmation = buildBookingConfirmationData(db, bookingId);
    if (!confirmation) {
        console.warn(`Booking confirmation skipped: booking ${bookingId} not found or without seats`);
        return false;
    }
    const { bookingReference } = confirmation.data;
    if (!confirmation.to?.trim()) {
        console.warn(`Booking confirmation skipped: the hiker of ${bookingReference} has no email address`);
        return false;
    }

    const { subject, html, text } = renderBookingConfirmation(confirmation.data);
    await sender.send({ from, to: confirmation.to, subject, html, text });
    console.log(`Booking confirmation sent for ${bookingReference}`);
    return true;
};

// Created on first use, so importing this module never opens an SMTP connection
let defaultSender: MailSender | undefined;

const getDefaultDeps = (): BookingConfirmationDeps => {
    defaultSender ??= createNodemailerSender({ host: SMTP_HOST, port: SMTP_PORT });
    return { db: appDb, sender: defaultSender, from: MAIL_FROM };
};

/**
 * Sends the booking confirmation in the background. Call it right after the booking transaction
 * has returned, without awaiting it: the request never waits for the email nor fails because of it.
 * @param bookingId The ID of the booking just committed.
 * @param deps Overrides the real database and SMTP sender (tests).
 * @returns A promise that always resolves, once the email has been sent or the failure logged.
 */
export const notifyBookingCreated = (bookingId: number, deps?: BookingConfirmationDeps): Promise<void> =>
    // setImmediate lets the caller finish its response before the email work starts
    new Promise<void>((resolve) => setImmediate(resolve))
        .then(() => sendBookingConfirmation(bookingId, deps ?? getDefaultDeps()))
        .then(
            () => undefined,
            (err: unknown) => {
                console.error(`Booking confirmation failed for booking ${bookingId}:`, (err as Error)?.message ?? err);
            }
        );
