import { setImmediate } from "node:timers/promises";
import { MAIL_FROM, SMTP_HOST, SMTP_PORT } from "../config/mail-config";
import { PASSWORD_RESET_TTL_HOURS, PASSWORD_RESET_URL } from "../config/config";
import { createNodemailerSender, MailSender } from "./mail-sender";
import { renderPasswordReset } from "./password-reset-template";

export type PasswordResetDeps = {
    sender: MailSender;
    from: string;
};

export type PasswordResetRecipient = {
    email: string;
    full_name: string;
};

/**
 * Builds the link of a reset email: the frontend page with the token in the query string.
 */
export const buildPasswordResetLink = (token: string): string => {
    const url = new URL(PASSWORD_RESET_URL);
    url.searchParams.set("token", token);
    return url.toString();
};

/**
 * Renders and sends the password reset email.
 * @throws If the sender fails.
 */
export const sendPasswordReset = async (to: PasswordResetRecipient, token: string, { sender, from }: PasswordResetDeps): Promise<void> => {
    const { subject, html, text } = renderPasswordReset({
        hikerName: to.full_name,
        link: buildPasswordResetLink(token),
        expiresInHours: PASSWORD_RESET_TTL_HOURS,
    });
    await sender.send({ from, to: to.email, subject, html, text });
};

// Created on first use, so importing this module never opens an SMTP connection
let defaultSender: MailSender | undefined;

const getDefaultDeps = (): PasswordResetDeps => {
    defaultSender ??= createNodemailerSender({ host: SMTP_HOST, port: SMTP_PORT });
    return { sender: defaultSender, from: MAIL_FROM };
};

/**
 * Sends the password reset email in the background, without awaiting it.
 * The token is never logged.
 * @returns A promise that always resolves, once the email has been sent or the failure logged.
 */
export const notifyPasswordResetRequested = (to: PasswordResetRecipient, token: string, deps?: PasswordResetDeps): Promise<void> =>
    // Lets the caller finish its response before the email work starts
    setImmediate()
        .then(() => sendPasswordReset(to, token, deps ?? getDefaultDeps()))
        .then(
            () => undefined,
            (err: unknown) => {
                console.error("Password reset email failed:", (err as Error)?.message ?? err);
            }
        );
