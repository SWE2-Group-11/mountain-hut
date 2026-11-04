// PLACEHOLDER: the final layout of this email is MH-41.
// Replace the body of renderBookingConfirmation freely, but keep BookingConfirmationData and the
// function signature unchanged: they are the contract with MH-43, which collects and formats the data.
// Every value typed by a user must go through escapeHtml before it ends up in the HTML.

export interface BookingConfirmationData {
    bookingReference: string;   // e.g. "MH-000123"
    hikerName: string;
    date: string;
    slot: string;
    partySize: number;
    requirements: { allergies: boolean; description: string }[]; // may be empty
}

/**
 * Escapes the characters that have a meaning in HTML, so user input is shown as plain text.
 */
export const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

/**
 * Renders the booking confirmation email sent to the hiker.
 * @param data The booking details, already formatted.
 * @returns The subject and the HTML and plain-text bodies.
 */
export function renderBookingConfirmation(
    data: BookingConfirmationData
): { subject: string; html: string; text: string } {
    const subject = `Booking confirmed: ${data.bookingReference}`;

    const requirementsHtml = data.requirements.length === 0
        ? "<p>No party requirements.</p>"
        : `<ul>${data.requirements
            .map((r) => r.allergies
                ? `<li style="color:#b00020;font-weight:bold">ALLERGY: ${escapeHtml(r.description)}</li>`
                : `<li>${escapeHtml(r.description)}</li>`)
            .join("")}</ul>`;

    const html = `<!doctype html>
<html>
<body style="font-family:sans-serif">
<p>Hello ${escapeHtml(data.hikerName)},</p>
<p>your booking at the Mountain Hut is confirmed.</p>
<table>
<tr><td>Booking reference</td><td><strong>${escapeHtml(data.bookingReference)}</strong></td></tr>
<tr><td>Date</td><td>${escapeHtml(data.date)}</td></tr>
<tr><td>Time slot</td><td>${escapeHtml(data.slot)}</td></tr>
<tr><td>Party size</td><td>${escapeHtml(String(data.partySize))}</td></tr>
</table>
<h3>Party requirements</h3>
${requirementsHtml}
</body>
</html>`;

    const requirementsText = data.requirements.length === 0
        ? "No party requirements."
        : data.requirements
            .map((r) => `- ${r.allergies ? "[ALLERGY] " : ""}${r.description}`)
            .join("\n");

    const text = [
        `Hello ${data.hikerName},`,
        "",
        "your booking at the Mountain Hut is confirmed.",
        "",
        `Booking reference: ${data.bookingReference}`,
        `Date: ${data.date}`,
        `Time slot: ${data.slot}`,
        `Party size: ${data.partySize}`,
        "",
        "Party requirements:",
        requirementsText,
    ].join("\n");

    return { subject, html, text };
}
