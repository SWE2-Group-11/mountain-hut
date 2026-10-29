import nodemailer from "nodemailer";

export type MailMessage = {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
};

/**
 * Anything able to deliver an email. Tests use an in-memory fake instead of SMTP.
 */
export interface MailSender {
    send(message: MailMessage): Promise<void>;
}

export type SmtpConfig = {
    host: string;
    port: number;
};

/**
 * Creates a MailSender that delivers through an SMTP server (Mailpit in development).
 * @param config The SMTP host and port.
 * @returns A MailSender whose send() rejects if the server cannot be reached.
 */
export const createNodemailerSender = ({ host, port }: SmtpConfig): MailSender => {
    // Mailpit speaks plain SMTP without authentication
    const transporter = nodemailer.createTransport({ host, port, secure: false });
    return {
        send: async (message) => {
            await transporter.sendMail(message);
        },
    };
};
