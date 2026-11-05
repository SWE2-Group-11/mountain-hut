import { describe, expect, it } from "vitest";
import {
    escapeHtml,
    renderBookingConfirmation,
} from "../../notifications/booking-confirmation-template";
import type { BookingConfirmationData } from "../../notifications/booking-confirmation-template";

function makeData(overrides: Partial<BookingConfirmationData> = {}): BookingConfirmationData {
    return {
        bookingReference: "MH-000123",
        hikerName: "Laura Bianchi",
        date: "Sat 7 Nov 2026",
        slot: "19:30–21:00",
        partySize: 7,
        requirements: [],
        ...overrides,
    };
}

describe("escapeHtml", () => {
    it.each([
        ["&", "&amp;"],
        ["<", "&lt;"],
        [">", "&gt;"],
        ['"', "&quot;"],
        ["'", "&#39;"],
        ["", ""],
        ["Laura Bianchi", "Laura Bianchi"],
        ['<img title="Tom & Jerry\'s">', "&lt;img title=&quot;Tom &amp; Jerry&#39;s&quot;&gt;"],
    ])("escapes %j as %j", (input, expected) => {
        expect(escapeHtml(input)).toBe(expected);
    });
});

describe("renderBookingConfirmation", () => {
    it("includes the reference in the subject and all booking details in both bodies", () => {
        const data = makeData();

        const result = renderBookingConfirmation(data);

        expect(result.subject).toBe("Booking confirmed: MH-000123");
        for (const value of [data.bookingReference, data.hikerName, data.date, data.slot, String(data.partySize)]) {
            expect(result.html).toContain(value);
            expect(result.text).toContain(value);
        }
    });

    it("explicitly reports that no party requirements were declared", () => {
        const result = renderBookingConfirmation(makeData());

        expect(result.html).toContain("No party requirements.");
        expect(result.text).toContain("No party requirements.");
        expect(result.html).not.toContain("ALLERGY:");
        expect(result.text).not.toContain("[ALLERGY]");
    });

    it("includes every dietary requirement and labels only allergies", () => {
        const result = renderBookingConfirmation(makeData({
            requirements: [
                { allergies: true, description: "Peanut allergy" },
                { allergies: false, description: "Two vegetarians" },
                { allergies: true, description: "Shellfish allergy" },
            ],
        }));

        for (const body of [result.html, result.text]) {
            expect(body).toContain("Peanut allergy");
            expect(body).toContain("Two vegetarians");
            expect(body).toContain("Shellfish allergy");
            expect(body).not.toContain("No party requirements.");
        }
        expect(result.html).toContain("ALLERGY: Peanut allergy");
        expect(result.html).toContain("ALLERGY: Shellfish allergy");
        expect(result.html).not.toContain("ALLERGY: Two vegetarians");
        expect(result.text).toContain("- [ALLERGY] Peanut allergy");
        expect(result.text).toContain("- [ALLERGY] Shellfish allergy");
        expect(result.text).toContain("- Two vegetarians");
        expect(result.text).not.toContain("[ALLERGY] Two vegetarians");
    });

    it.each(["hikerName", "bookingReference", "date", "slot"] as const)(
        "escapes the %s field in HTML while preserving it in plain text",
        field => {
            const input = '<img src=x onerror="alert(1)"> & O\'Neil';
            const escaped = "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; O&#39;Neil";

            const result = renderBookingConfirmation(makeData({ [field]: input }));

            expect(result.html).toContain(escaped);
            expect(result.html).not.toContain("<img");
            expect(result.text).toContain(input);
        },
    );

    it.each([true, false])("escapes a dietary description when allergies=%s", allergies => {
        const description = '<script>alert("allergy")</script> & O\'Neil';

        const result = renderBookingConfirmation(makeData({
            requirements: [{ allergies, description }],
        }));

        expect(result.html).toContain("&lt;script&gt;alert(&quot;allergy&quot;)&lt;/script&gt; &amp; O&#39;Neil");
        expect(result.html).not.toContain("<script>");
        expect(result.text).toContain(description);
    });

    it("does not mutate the booking data or its requirements", () => {
        const data = makeData({ requirements: [{ allergies: true, description: "Peanut allergy" }] });
        const before = structuredClone(data);

        renderBookingConfirmation(data);

        expect(data).toEqual(before);
    });
});
