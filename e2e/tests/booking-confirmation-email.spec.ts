import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// Mailpit started by playwright.config.ts (or the docker compose one)
const MAILPIT_API = 'http://localhost:8025/api/v1';
const PASSWORD = 'password';
// Laura books 19:30: book-table.spec.ts books 13:00 for Mario on the same backend
const LAURA = 'laura@mountainhut.test';

type MailpitSummary = {
  ID: string;
  Created: string;
  Subject: string;
  From: { Address: string };
  To: { Address: string }[];
};
type MailpitMessage = { Text: string; HTML: string };

const login = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

/**
 * Waits for the email with the given recipient and subject, received after `since`.
 * Booking IDs restart at every run (in-memory database), so older emails in a reused
 * Mailpit inbox can have the same subject: the timestamp tells them apart.
 */
const waitForEmail = async (request: APIRequestContext, to: string, subject: string, since: Date) => {
  let found: MailpitSummary | undefined;
  await expect
    .poll(async () => {
      const res = await request.get(`${MAILPIT_API}/messages`, { params: { limit: 50 } });
      const { messages } = (await res.json()) as { messages: MailpitSummary[] };
      found = messages.find(
        (m) =>
          m.Subject === subject &&
          m.To.some((r) => r.Address === to) &&
          new Date(m.Created) >= since,
      );
      return found !== undefined;
    }, { message: `email "${subject}" to ${to}`, timeout: 10_000 })
    .toBe(true);
  const res = await request.get(`${MAILPIT_API}/message/${found!.ID}`);
  return { summary: found!, message: (await res.json()) as MailpitMessage };
};

test.describe('Booking confirmation email', () => {
  test('a hiker who books a table receives the confirmation email', async ({ page, request }) => {
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    // Mailpit timestamps have second precision
    const since = new Date(Date.now() - 1000);

    await login(page, LAURA);
    await expect(page).toHaveURL(/\/book-table$/);
    if (tomorrow.getMonth() !== today.getMonth()) {
      await page.getByRole('button', { name: 'Next month' }).click();
    }
    await page.getByRole('button', { name: String(tomorrow.getDate()), exact: true }).click();
    await page.getByRole('button', { name: /^19:30/ }).click();
    await page.getByRole('button', { name: 'Increase party size' }).click();
    // The party size the hiker sees before booking is the one the email must report
    const shownPartySize = await page.getByText(/^\d+ (Person|People)$/).textContent();
    const partySize = Number(shownPartySize!.match(/^\d+/)![0]);
    await page.getByRole('button', { name: 'Book Table' }).click();

    const confirmation = page.getByText(/Booking #\d+ confirmed/);
    await expect(confirmation).toBeVisible();
    const bookingId = Number((await confirmation.textContent())!.match(/#(\d+)/)![1]);
    const reference = `MH-${String(bookingId).padStart(6, '0')}`;

    const { summary, message } = await waitForEmail(request, LAURA, `Booking confirmed: ${reference}`, since);

    expect(summary.From.Address).toBe('no-reply@mountainhut.local');
    const parts = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }).formatToParts(tomorrow);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
    const date = `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
    const party = `${partySize} ${partySize === 1 ? 'person' : 'people'}`;
    expect(message.Text).toContain('Your booking is confirmed');
    expect(message.Text).toContain('Hello Laura Bianchi,');
    expect(message.Text).toContain(`Booking reference: ${reference}`);
    expect(message.Text).toContain(`Date: ${date}`);
    expect(message.Text).toContain('Time slot: 19:30–21:00');
    expect(message.Text).toContain(`Party size: ${party}`);

    // The HTML version, as an email client would show it. Its layout tables are presentational,
    // so each detail is read as the value right below its label.
    await page.setContent(message.HTML);
    const detail = (label: string) =>
      page.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]');
    await expect(page.getByRole('heading', { name: 'Your booking is confirmed' })).toBeVisible();
    await expect(page.getByText('Hello Laura Bianchi,')).toBeVisible();
    await expect(detail('Booking reference')).toHaveText(reference);
    await expect(detail('Date')).toHaveText(date);
    await expect(detail('Time slot')).toHaveText('19:30–21:00');
    await expect(detail('Party size')).toHaveText(party);
    await expect(page.getByRole('heading', { name: 'Party requirements' })).toBeVisible();
    await expect(page.getByText('No party requirements.')).toBeVisible();
  });
});
