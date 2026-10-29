// Outgoing mail (SMTP). The defaults match Mailpit running on the same machine.
export const SMTP_HOST = process.env.SMTP_HOST ?? "localhost";
export const SMTP_PORT = Number(process.env.SMTP_PORT) || 1025;

// Sender shown in the hiker's inbox
export const MAIL_FROM = process.env.MAIL_FROM ?? "Mountain Hut <no-reply@mountainhut.local>";
