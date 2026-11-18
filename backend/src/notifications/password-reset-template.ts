// Layout of the password reset email. Same email-safe rules as booking-confirmation-template.ts:
// table layout, inline styles, no images or scripts; user input goes through escapeHtml.
import { escapeHtml } from "./booking-confirmation-template";

export interface PasswordResetData {
    hikerName: string;
    link: string;            // page of the frontend with the token in the query string
    expiresInHours: number;
}

// Colours of the website
const GREEN = "#234E39";
const INK = "#1C2826";
const MUTED = "#5A6865";
const BORDER = "#EFEADF";
const PAGE = "#FDFBF7";

const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

/**
 * Renders the email with the password reset link.
 * @param data The hiker's name, the link and its lifetime.
 * @returns The subject and the HTML and plain-text bodies.
 */
export function renderPasswordReset(data: PasswordResetData): { subject: string; html: string; text: string } {
    const subject = "Reset your Mountain Hut password";
    const validity = `The link is valid for ${data.expiresInHours} hours and can be used only once.`;
    const ignore = "If you did not ask to reset your password, ignore this email: your password stays the same.";
    const link = escapeHtml(data.link);

    // what even is this lol. All Claude's vomit, certainly not mine
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">
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
<h1 style="margin:0 0 12px 0;font-family:${SERIF};font-size:24px;line-height:30px;color:${INK};">Reset your password</h1>
<p style="margin:0;font-size:16px;line-height:24px;color:${INK};">Hello ${escapeHtml(data.hikerName)},</p>
<p style="margin:12px 0 0 0;font-size:16px;line-height:24px;color:${INK};">We received a request to reset the password of your account. Choose a new one from the button below.</p>
</td>
</tr>
<tr>
<td align="center" style="padding:24px 28px;">
<a href="${link}" style="display:inline-block;background-color:${GREEN};color:#FFFFFF;font-family:${SANS};font-size:16px;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:8px;">Choose a new password</a>
</td>
</tr>
<tr>
<td style="padding:0 28px 32px 28px;font-family:${SANS};font-size:14px;line-height:21px;color:${MUTED};">
<p style="margin:0 0 12px 0;">${escapeHtml(validity)}</p>
<p style="margin:0 0 12px 0;">If the button does not work, copy this address into your browser:<br><a href="${link}" style="color:${GREEN};word-break:break-all;">${link}</a></p>
<p style="margin:0;">${escapeHtml(ignore)}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

    const text = [
        "MOUNTAIN HUT",
        "Reset your password",
        "",
        `Hello ${data.hikerName},`,
        "",
        "We received a request to reset the password of your account. Choose a new one at this address:",
        data.link,
        "",
        validity,
        ignore,
        "",
        "This is an automatic message, please do not reply to it.",
    ].join("\n");

    return { subject, html, text };
}
