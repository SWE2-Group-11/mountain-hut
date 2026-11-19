import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildPasswordResetLink,
    notifyPasswordResetRequested,
    sendPasswordReset,
} from "../../notifications/password-reset";
import { renderPasswordReset } from "../../notifications/password-reset-template";
import { CLIENT_ORIGIN } from "../../config/config";

/*
UNIT tests for the password reset email of MH-171.
Covered: buildPasswordResetLink, sendPasswordReset, notifyPasswordResetRequested (password-reset)
and renderPasswordReset (password-reset-template).
The mail sender is a fake: no SMTP is used.
*/

vi.mock("../../notifications/mail-sender", () => ({ createNodemailerSender: vi.fn() }));

const FROM = "Mountain Hut <sender@example.test>";
const TOKEN = "Abc-123_xyz";
const RECIPIENT = { email: "anna.neri@mountainhut.test", full_name: "Anna Neri" };

const fakeSender = () => ({ send: vi.fn<(message: unknown) => Promise<void>>().mockResolvedValue(undefined) });

beforeEach(() => {
    vi.restoreAllMocks();
});

describe("buildPasswordResetLink (unit)", () => {
    it("points to <CLIENT_ORIGIN>/reset-password with the token in the query string", () => {
        // Why: api.md - the link is <CLIENT_ORIGIN>/reset-password?token=<token>
        const link = new URL(buildPasswordResetLink(TOKEN));

        expect(link.origin).toBe(new URL(CLIENT_ORIGIN).origin);
        expect(link.pathname).toBe("/reset-password");
        expect(link.searchParams.get("token")).toBe(TOKEN);
    });

    it("keeps a token with special characters intact", () => {
        // Why: the frontend must read back exactly the token that was emailed
        const token = "a+b/c=d&e";

        expect(new URL(buildPasswordResetLink(token)).searchParams.get("token")).toBe(token);
    });
});

describe("renderPasswordReset (unit)", () => {
    const DATA = { hikerName: "Anna Neri", link: "http://localhost:5173/reset-password?token=abc", expiresInHours: 24 };

    it("says that the link is valid for 24 hours and only once", () => {
        // Why: requirement - email reset links expire after 24 hours; api.md - the link works only once
        const { html, text } = renderPasswordReset(DATA);

        expect(text).toContain("24 hours");
        expect(html).toContain("24 hours");
        expect(text).toMatch(/only once/);
    });

    it("contains the link in both the HTML and the text version", () => {
        const { html, text } = renderPasswordReset(DATA);

        expect(html).toContain(`href="${DATA.link}"`);
        expect(text).toContain(DATA.link);
    });

    it("escapes the hiker's name in the HTML", () => {
        // Why: the name is user input and must not inject HTML into the email
        const { html } = renderPasswordReset({ ...DATA, hikerName: "<b>Anna</b>" });

        expect(html).not.toContain("<b>Anna</b>");
        expect(html).toContain("&lt;b&gt;Anna&lt;/b&gt;");
    });
});

describe("sendPasswordReset (unit)", () => {
    it("sends one email to the hiker with the reset link and the 24-hour validity", async () => {
        // Why: requirement - the hiker can recover the password via email
        const sender = fakeSender();

        await sendPasswordReset(RECIPIENT, TOKEN, { sender, from: FROM });

        expect(sender.send).toHaveBeenCalledTimes(1);
        const message = sender.send.mock.calls[0][0] as { from: string; to: string; subject: string; html: string; text: string };
        expect(message.from).toBe(FROM);
        expect(message.to).toBe(RECIPIENT.email);
        expect(message.subject).toEqual(expect.any(String));
        expect(message.text).toContain(buildPasswordResetLink(TOKEN));
        expect(message.text).toContain("Anna Neri");
        expect(message.text).toContain("24 hours");
    });

    it("lets a sender failure through", async () => {
        const sender = { send: vi.fn().mockRejectedValue(new Error("SMTP down")) };

        await expect(sendPasswordReset(RECIPIENT, TOKEN, { sender, from: FROM })).rejects.toThrow("SMTP down");
    });
});

describe("notifyPasswordResetRequested (unit)", () => {
    it("sends the email in the background and resolves", async () => {
        const sender = fakeSender();

        await expect(notifyPasswordResetRequested(RECIPIENT, TOKEN, { sender, from: FROM })).resolves.toBeUndefined();
        expect(sender.send).toHaveBeenCalledTimes(1);
    });

    it("resolves even when the sender fails, and logs the error without the token", async () => {
        // Why: api.md - the request answers 202 anyway; the token is a secret and must not be logged
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const sender = { send: vi.fn().mockRejectedValue(new Error("SMTP down")) };

        await expect(notifyPasswordResetRequested(RECIPIENT, TOKEN, { sender, from: FROM })).resolves.toBeUndefined();

        expect(log).toHaveBeenCalled();
        expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
    });
});
