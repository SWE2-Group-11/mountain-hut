// Change notification email (MH-06): sent to the hiker after a change to their booking is committed.
// It reuses the data collection of the confirmation email (MH-43); only the template differs.
import { db as appDb } from "../database/database";
import { MAIL_FROM, SMTP_HOST, SMTP_PORT } from "../config/mail-config";
import { createNodemailerSender, MailSender } from "./mail-sender";
import { buildBookingConfirmationData } from "./booking-confirmation";
import type { BookingConfirmationDeps } from "./booking-confirmation";
import { renderBookingChange } from "./booking-change-template";

/**
 * Builds, renders and sends the change notification email of a booking.
 * @param bookingId The ID of a booking whose change has been committed.
 * @param deps The database, the sender and the "from" address.
 * @returns true if the email was handed to the sender, false if it was skipped.
 * @throws If the database read, the template or the sender fails.
 */
export const sendBookingChange = async (bookingId: number, { db, sender, from }: BookingConfirmationDeps): Promise<boolean> => {
    const booking = buildBookingConfirmationData(db, bookingId);
    if (!booking) {
        console.warn(`Booking change notification skipped: booking ${bookingId} not found or without seats`);
        return false;
    }
    const { bookingReference } = booking.data;
    if (!booking.to?.trim()) {
        console.warn(`Booking change notification skipped: the hiker of ${bookingReference} has no email address`);
        return false;
    }

    const { subject, html, text } = renderBookingChange(booking.data);
    await sender.send({ from, to: booking.to, subject, html, text });
    console.log(`Booking change notification sent for ${bookingReference}`);
    return true;
};

// Created on first use, so importing this module never opens an SMTP connection
let defaultSender: MailSender | undefined;

const getDefaultDeps = (): BookingConfirmationDeps => {
    defaultSender ??= createNodemailerSender({ host: SMTP_HOST, port: SMTP_PORT });
    return { db: appDb, sender: defaultSender, from: MAIL_FROM };
};

/**
 * Sends the change notification in the background. Call it right after the update transaction
 * has committed, without awaiting it: the request never waits for the email nor fails because of it.
 * @param bookingId The ID of the booking just changed.
 * @param deps Overrides the real database and SMTP sender (tests).
 * @returns A promise that always resolves, once the email has been sent or the failure logged.
 */
export const notifyBookingChanged = (bookingId: number, deps?: BookingConfirmationDeps): Promise<void> =>
    // setImmediate lets the caller finish its response before the email work starts
    new Promise<void>((resolve) => setImmediate(resolve))
        .then(() => sendBookingChange(bookingId, deps ?? getDefaultDeps()))
        .then(
            () => undefined,
            (err: unknown) => {
                console.error(`Booking change notification failed for booking ${bookingId}:`, (err as Error)?.message ?? err);
            }
        );