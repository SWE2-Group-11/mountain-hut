// Layout of the email sent when a booking has been changed (MH-06).
// It reuses the confirmation email (MH-41) and only replaces its subject, preheader,
// heading and introduction, so the two emails always share the same layout and details.
import { renderBookingConfirmation } from "./booking-confirmation-template";
import type { BookingConfirmationData } from "./booking-confirmation-template";

// The texts of the confirmation email that the change email replaces
const CONFIRMED_SUBJECT = "Booking confirmed: ";
const CONFIRMED_PREHEADER = "Your table is booked: ";
const CONFIRMED_HEADING = "Your booking is confirmed";
const CONFIRMED_INTRO = "Your table at the Mountain Hut is booked. We look forward to welcoming you.";

const CHANGED_SUBJECT = "Booking changed: ";
const CHANGED_PREHEADER = "Your booking is now: ";
const CHANGED_HEADING = "Your booking has been changed";
const CHANGED_INTRO = "Your booking at the Mountain Hut has been updated. These are the new details.";

/**
 * Replaces every occurrence of a text, failing loudly if it is missing: if the confirmation
 * email changes its wording, the change email must not silently keep saying "confirmed".
 */
const replaceRequired = (source: string, from: string, to: string): string => {
    if (!source.includes(from)) {
        throw new Error(`Booking change email: "${from}" not found in the confirmation email`);
    }
    return source.split(from).join(to);
};

/**
 * Renders the email sent to the hiker after a booking has been changed.
 * @param data The booking details after the change, already formatted.
 * @returns The subject and the HTML and plain-text bodies.
 * @throws Error if the confirmation email no longer contains the texts this email replaces.
 */
export const renderBookingChange = (
    data: BookingConfirmationData
): { subject: string; html: string; text: string } => {
    const confirmation = renderBookingConfirmation(data);

    let html = replaceRequired(confirmation.html, CONFIRMED_SUBJECT, CHANGED_SUBJECT);
    html = replaceRequired(html, CONFIRMED_PREHEADER, CHANGED_PREHEADER);
    html = replaceRequired(html, CONFIRMED_HEADING, CHANGED_HEADING);
    html = replaceRequired(html, CONFIRMED_INTRO, CHANGED_INTRO);

    let text = replaceRequired(confirmation.text, CONFIRMED_HEADING, CHANGED_HEADING);
    text = replaceRequired(text, CONFIRMED_INTRO, CHANGED_INTRO);

    return {
        subject: replaceRequired(confirmation.subject, CONFIRMED_SUBJECT, CHANGED_SUBJECT),
        html,
        text,
    };
};