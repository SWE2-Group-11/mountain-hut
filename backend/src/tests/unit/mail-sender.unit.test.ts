import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNodemailerSender } from "../../notifications/mail-sender";
import type { MailMessage } from "../../notifications/mail-sender";

const mocks = vi.hoisted(() => ({ createTransport: vi.fn(), sendMail: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));

const MESSAGE: MailMessage = {
    from: "Mountain Hut <sender@example.test>",
    to: "hiker@example.test",
    subject: "Booking confirmed: MH-000123",
    html: "<p>Booking confirmed</p>",
    text: "Booking confirmed",
};

beforeEach(() => {
    vi.resetAllMocks();
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue({ messageId: "test-message" });
});

describe("createNodemailerSender", () => {
    it("configures SMTP using the supplied host and port without sending on construction", () => {
        createNodemailerSender({ host: "smtp.example.test", port: 2525 });

        expect(mocks.createTransport).toHaveBeenCalledExactlyOnceWith({
            host: "smtp.example.test", port: 2525, secure: false,
        });
        expect(mocks.sendMail).not.toHaveBeenCalled();
    });

    it("forwards every message field to Nodemailer and resolves without returning transport metadata", async () => {
        const sender = createNodemailerSender({ host: "localhost", port: 1025 });

        await expect(sender.send(MESSAGE)).resolves.toBeUndefined();

        expect(mocks.sendMail).toHaveBeenCalledExactlyOnceWith(MESSAGE);
    });

    it("waits for sendMail to finish before resolving", async () => {
        let finish!: () => void;
        mocks.sendMail.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
        const sender = createNodemailerSender({ host: "localhost", port: 1025 });
        let settled = false;
        const pending = sender.send(MESSAGE).then(() => { settled = true; });

        await Promise.resolve();
        expect(settled).toBe(false);
        finish();
        await pending;
        expect(settled).toBe(true);
    });

    it("propagates a Nodemailer rejection", async () => {
        const failure = new Error("SMTP connection refused");
        mocks.sendMail.mockRejectedValue(failure);
        const sender = createNodemailerSender({ host: "localhost", port: 1025 });

        await expect(sender.send(MESSAGE)).rejects.toBe(failure);
        expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    });
});
