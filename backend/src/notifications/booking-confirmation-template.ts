// Layout of the booking confirmation email (MH-41).
// BookingConfirmationData and the signature of renderBookingConfirmation are the contract with MH-43,
// which collects and formats the data: change the layout freely, not the contract.
// Every value typed by a user must go through escapeHtml before it ends up in the HTML.
//
// The HTML is built for email clients, which ignore most modern CSS: a table layout, inline styles,
// no images, no scripts and no external files, so it looks the same with remote content blocked.

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

// Colours of the website
const GREEN = "#234E39";
const INK = "#1C2826";
const MUTED = "#5A6865";
const CREAM = "#FAF6EE";
const BORDER = "#EFEADF";
const PAGE = "#FDFBF7";
const ALERT = "#B00020";
const ALERT_BACKGROUND = "#FDECEC";

const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const NO_REQUIREMENTS = "No party requirements.";

/** "1 person", "7 people". */
const formatParty = (size: number): string => `${size} ${size === 1 ? "person" : "people"}`;

/** One row of the booking details: a small label above its value. */
const detailRow = (label: string, value: string, last = false): string => `
<tr>
<td style="padding:0 0 ${last ? "0" : "16px"} 0;font-family:${SANS};">
<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding-bottom:3px;">${label}</div>
<div style="font-size:17px;font-weight:bold;color:${INK};">${escapeHtml(value)}</div>
</td>
</tr>`;

const requirementsHtml = (requirements: BookingConfirmationData["requirements"]): string => {
    if (requirements.length === 0) {
        return `<p style="margin:0;font-family:${SANS};font-size:15px;line-height:22px;color:${MUTED};">${NO_REQUIREMENTS}</p>`;
    }
    const rows = requirements
        .map((r) => r.allergies
            ? `<tr><td style="padding:0 0 8px 0;"><div style="background-color:${ALERT_BACKGROUND};border-left:4px solid ${ALERT};padding:10px 12px;font-family:${SANS};font-size:15px;line-height:22px;font-weight:bold;color:${ALERT};">ALLERGY: ${escapeHtml(r.description)}</div></td></tr>`
            : `<tr><td style="padding:0 0 8px 0;"><div style="background-color:${CREAM};border-left:4px solid ${BORDER};padding:10px 12px;font-family:${SANS};font-size:15px;line-height:22px;color:${INK};">${escapeHtml(r.description)}</div></td></tr>`)
        .join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
};

/**
 * Renders the booking confirmation email sent to the hiker.
 * @param data The booking details, already formatted.
 * @returns The subject and the HTML and plain-text bodies.
 */
export function renderBookingConfirmation(
    data: BookingConfirmationData
): { subject: string; html: string; text: string } {
    const subject = `Booking confirmed: ${data.bookingReference}`;

    // The first line shown next to the subject in the inbox
    const preheader = `Your table is booked: ${data.date}, ${data.slot}, ${formatParty(data.partySize)}.`;

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${PAGE};">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background-color:${PAGE};">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border:1px solid ${BORDER};border-radius:16px;">
<tr>
<td align="center" bgcolor="${GREEN}" style="background-color:${GREEN};border-radius:16px 16px 0 0;padding:26px 24px;">
<div style="font-family:${SERIF};font-size:26px;font-weight:bold;color:#FFFFFF;">Mountain Hut</div>
</td>
</tr>
<tr>
<td style="padding:32px 28px 8px 28px;font-family:${SANS};">
<h1 style="margin:0 0 12px 0;font-family:${SERIF};font-size:24px;line-height:30px;color:${INK};">Your booking is confirmed</h1>
<p style="margin:0;font-size:16px;line-height:24px;color:${INK};">Hello ${escapeHtml(data.hikerName)},</p>
<p style="margin:12px 0 0 0;font-size:16px;line-height:24px;color:${INK};">Your table at the Mountain Hut is booked. We look forward to welcoming you.</p>
</td>
</tr>
<tr>
<td style="padding:20px 28px 8px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CREAM}" style="background-color:${CREAM};border:1px solid ${BORDER};border-radius:12px;">
<tr>
<td style="padding:20px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${detailRow("Booking reference", data.bookingReference)}${detailRow("Date", data.date)}${detailRow("Time slot", data.slot)}${detailRow("Party size", formatParty(data.partySize), true)}
</table>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:24px 28px 8px 28px;">
<h2 style="margin:0 0 12px 0;font-family:${SERIF};font-size:18px;line-height:24px;color:${INK};">Party requirements</h2>
${requirementsHtml(data.requirements)}
</td>
</tr>
<tr>
<td style="padding:24px 28px 32px 28px;">

</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

    const requirementsText = data.requirements.length === 0
        ? NO_REQUIREMENTS
        : data.requirements
            .map((r) => `- ${r.allergies ? "[ALLERGY] " : ""}${r.description}`)
            .join("\n");

    const text = [
        "MOUNTAIN HUT",
        "Your booking is confirmed",
        "",
        `Hello ${data.hikerName},`,
        "",
        "Your table at the Mountain Hut is booked. We look forward to welcoming you.",
        "",
        `Booking reference: ${data.bookingReference}`,
        `Date: ${data.date}`,
        `Time slot: ${data.slot}`,
        `Party size: ${formatParty(data.partySize)}`,
        "",
        "Party requirements:",
        requirementsText,
        "",
        "This is an automatic message, please do not reply to it.",
    ].join("\n");

    return { subject, html, text };
}