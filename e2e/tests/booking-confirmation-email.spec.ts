import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

// Mailpit started by playwright.config.ts (or the docker compose one)
const MAILPIT_API = 'http://localhost:8025/api/v1';
const API = 'http://localhost:3000/api/v1';
const PASSWORD = 'password';
// Laura books 19:30: book-table.spec.ts books 13:00 for Mario on the same backend
const LAURA = 'laura@mountainhut.test';
const WARDEN = 'warden@mountainhut.test';

// The emails with party requirements use their own slots on today + 50 (no other spec uses that
// day), as a hiker can book a slot only once. Each slot has T1 = 4 and T2 = 2 seats.
const REQUIREMENTS_DAY_OFFSET = 50;
const REQUIREMENTS_SLOTS = {
  fromForm: ['12:00', '13:00'],
  typedHtml: ['19:00', '20:00'],
} as const;

/** YYYY-MM-DD of today + n days, in the local time zone (as the booking form sends it). */
const dayFromToday = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const REQUIREMENTS_DAY = dayFromToday(REQUIREMENTS_DAY_OFFSET);

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

/** Logs in a separate API session (no browser). */
const apiLogin = async (api: APIRequestContext, email: string) => {
  const response = await api.post(`${API}/session`, { data: { email, password: PASSWORD } });
  expect(response.ok(), `login as ${email}`).toBeTruthy();
};

/** Picks today + n days in the calendar of the booking form, moving month by month. */
const pickDay = async (page: Page, n: number) => {
  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  const months = (target.getFullYear() - today.getFullYear()) * 12 + target.getMonth() - today.getMonth();
  for (let i = 0; i < months; i++) {
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  await page.getByRole('button', { name: String(target.getDate()), exact: true }).click();
};

/** "MH-000042" from the booking ID. */
const referenceOf = (bookingId: number) => `MH-${String(bookingId).padStart(6, '0')}`;

/** The "Party requirements" section of the HTML email loaded in the page, one entry per requirement. */
const requirementEntries = (page: Page) =>
  page
    .getByRole('heading', { name: 'Party requirements' })
    .locator('xpath=following-sibling::table[1]')
    .locator('td > div');

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
  // Creates the slots of REQUIREMENTS_DAY once. A retried test (CI retries once, on the same
  // database) finds them already there.
  test.beforeAll(async ({ playwright }) => {
    const warden = await playwright.request.newContext();
    try {
      await apiLogin(warden, WARDEN);
      const response = await warden.get(`${API}/slots?date=${REQUIREMENTS_DAY}`);
      const existing = ((await response.json()) as { start_time: string }[]).map((s) => s.start_time);
      for (const [startTime, endTime] of Object.values(REQUIREMENTS_SLOTS)) {
        if (existing.includes(startTime)) continue;
        const created = await warden.post(`${API}/slots`, {
          data: {
            date: REQUIREMENTS_DAY,
            startTime,
            endTime,
            tables: [
              { tableNumber: 1, seats: 4 },
              { tableNumber: 2, seats: 2 },
            ],
          },
        });
        expect(created.status(), `slot ${startTime}`).toBe(201);
      }
    } finally {
      await warden.dispose();
    }
  });

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
    const reference = referenceOf(bookingId);

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

  test('the email lists the food needs declared in the booking form, with allergies in red', async ({ page, request }) => {
    // Why: the kitchen and the hiker read the requirements in the email; allergies must stand out.
    const since = new Date(Date.now() - 1000);
    await login(page, LAURA);
    await expect(page).toHaveURL(/\/book-table$/);
    await pickDay(page, REQUIREMENTS_DAY_OFFSET);
    await page.getByRole('button', { name: new RegExp(`^${REQUIREMENTS_SLOTS.fromForm[0]}`) }).click();
    await page.getByRole('button', { name: 'Increase party size' }).click();
    await expect(page.getByText(/^\d+ (Person|People)$/)).toHaveText('3 People');

    // Two people vegetarian, one with a nut allergy who also avoids sesame
    await page.getByRole('button', { name: 'Add someone with a food need' }).click();
    await page.getByRole('button', { name: 'More people, need 1' }).click();
    await page.getByRole('group', { name: 'Food needs, need 1' }).getByRole('button', { name: 'Vegetarian' }).click();
    await page.getByRole('button', { name: 'Add another' }).click();
    await page.getByRole('group', { name: 'Food needs, need 2' }).getByRole('button', { name: 'Nut allergy' }).click();
    await page.getByLabel('Anything else? (optional)').nth(1).fill('no sesame');
    await page.getByRole('button', { name: 'Book Table' }).click();

    // The receipt shows what the server saved
    const confirmation = page.getByText(/Booking #\d+ confirmed/);
    await expect(confirmation).toBeVisible();
    await expect(page.getByText('Dietary needs')).toBeVisible();
    await expect(page.getByText('Dietary needs').locator('xpath=following-sibling::ul[1]/li')).toHaveText([
      '2 people: vegetarian',
      'Allergy: 1 person: nut allergy, no sesame',
    ]);
    const reference = referenceOf(Number((await confirmation.textContent())!.match(/#(\d+)/)![1]));

    const { message } = await waitForEmail(request, LAURA, `Booking confirmed: ${reference}`, since);

    expect(message.Text).toContain('Party size: 3 people');
    // SMTP delivers the text body with CRLF line endings
    expect(message.Text.replace(/\r\n/g, '\n')).toContain(
      'Party requirements:\n- 2 people: vegetarian\n- [ALLERGY] 1 person: nut allergy, no sesame\n',
    );
    expect(message.Text).not.toContain('No party requirements.');

    await page.setContent(message.HTML);
    await expect(requirementEntries(page)).toHaveText([
      '2 people: vegetarian',
      'ALLERGY: 1 person: nut allergy, no sesame',
    ]);
    await expect(requirementEntries(page).nth(1)).toHaveCSS('color', 'rgb(176, 0, 32)');
    await expect(requirementEntries(page).nth(0)).not.toHaveCSS('color', 'rgb(176, 0, 32)');
    await expect(page.getByText('No party requirements.')).toHaveCount(0);
  });

  test('the requirements typed by the hiker are shown as plain text in the email', async ({ page, request, playwright }) => {
    // Why: details are free text; markup in them must not be interpreted by the email client.
    const since = new Date(Date.now() - 1000);
    const details = `1 person: <b>no</b> "nuts" & <img src=x onerror=alert(1)>`;
    const hiker = await playwright.request.newContext();
    let bookingId: number;
    try {
      await apiLogin(hiker, LAURA);
      const booked = await hiker.post(`${API}/reservations`, {
        data: {
          date: REQUIREMENTS_DAY,
          slot: REQUIREMENTS_SLOTS.typedHtml[0],
          partySize: 1,
          requirements: [{ hasAllergies: true, details }],
        },
      });
      expect(booked.status()).toBe(201);
      bookingId = (await booked.json()).id;
    } finally {
      await hiker.dispose();
    }

    const { message } = await waitForEmail(request, LAURA, `Booking confirmed: ${referenceOf(bookingId)}`, since);
    expect(message.Text).toContain(`- [ALLERGY] ${details}`);

    await page.setContent(message.HTML);
    await expect(requirementEntries(page)).toHaveText([`ALLERGY: ${details}`]);
    await expect(page.locator('b, img')).toHaveCount(0);
  });
});
