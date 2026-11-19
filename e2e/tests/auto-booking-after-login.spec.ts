import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test';

// MH-91 - Automatic booking after log in ("Prefill info in UI").
// Agreed behaviour (PR #94): "The 'Book a table' button of the availability check now opens the
// booking page with the checked day, time and party size already filled in." A visitor who checks
// (MH-04) and presses "Book a table" logs in and finds the booking form filled in; nothing is booked
// until the hiker presses "Book Table" (MH-01, one booking per hiker and slot), which sends the
// confirmation email (MH-03).
//
// The backend runs on one in-memory database for the whole run (see playwright.config.ts), so the
// specs share it. Every test uses its own slot of DAY (today + 80, or + 90 on the CI retry: no other
// spec uses these days) and a hiker registered just for it, so its bookings and emails are its own.
// Every slot has the seeded layout (T1 = 4, T2 = 4, T3 = 6, T4 = 2): these slots are the most recent
// "previous setups", and define-slot-capacity.spec.ts looks for that layout among them.

const API = 'http://localhost:3000/api/v1';
const MAILPIT_API = 'http://localhost:8025/api/v1';
const STAFF_PASSWORD = 'password';
const HIKER_PASSWORD = 'Mh169-password';
const EMPLOYEE = 'employee@mountainhut.test';
const WARDEN = 'warden@mountainhut.test';

const DAY_OFFSET = 80;
const DAY_OFFSET_PER_RETRY = 10;
const SEEDED_LAYOUT = [
  { tableNumber: 1, seats: 4 },
  { tableNumber: 2, seats: 4 },
  { tableNumber: 3, seats: 6 },
  { tableNumber: 4, seats: 2 },
];
const SLOT_SEATS = 16;

// "No email was sent" is proven by watching Mailpit for this long, never by the order of a later email
const NO_EMAIL_WINDOW_MS = 5_000;
const MAILPIT_POLL_MS = 500;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Day = { iso: string; date: Date };
type Booking = { id: number; date: string; slot: string; partySize: number; requirements: unknown[] };
type Hiker = { email: string; fullname: string; api: APIRequestContext };
type MailpitSummary = { ID: string; Subject: string; To: { Address: string }[] };

/** The day used by this attempt: today + 80, then 10 days later on each retry. */
const testDay = (retry: number): Day => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + DAY_OFFSET + DAY_OFFSET_PER_RETRY * retry);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { iso: `${date.getFullYear()}-${month}-${day}`, date };
};

/** "7 Feb 2027"-like text of a day, loose on the month name ("Sep" or "Sept"). Labels touch the
 * values in the text of the summary ("Date7 Feb 2027Time"), so digits, not word edges, bound it. */
const shortDatePattern = (day: Day) =>
  new RegExp(`(?<!\\d)${day.date.getDate()} ${MONTHS[day.date.getMonth()]}\\w* ${day.date.getFullYear()}(?!\\d)`);

const endOf = (start: string) => `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`;

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** Creates a slot of DAY with the seeded layout, as the warden, through the API. */
const createSlot = async (playwright: PlaywrightWorkerArgs['playwright'], day: Day, start: string) => {
  const warden = await playwright.request.newContext();
  try {
    const login = await warden.post(`${API}/session`, { data: { email: WARDEN, password: STAFF_PASSWORD } });
    expect(login.ok(), 'warden login').toBeTruthy();
    const created = await warden.post(`${API}/slots`, {
      data: { date: day.iso, startTime: start, endTime: endOf(start), tables: SEEDED_LAYOUT },
    });
    expect(created.status(), `slot ${day.iso} ${start}`).toBe(201);
  } finally {
    await warden.dispose();
  }
};

/** Registers a new hiker (POST /accounts) and logs them into an API session of their own. */
const registerHiker = async (playwright: PlaywrightWorkerArgs['playwright'], label: string): Promise<Hiker> => {
  const email = `mh169-${randomUUID()}@mountainhut.test`;
  const fullname = `Hiker ${label}`;
  const api = await playwright.request.newContext();
  const created = await api.post(`${API}/accounts`, {
    data: { fullname, mobile_number: '+39 300 169 0000', email, password: HIKER_PASSWORD },
  });
  expect(created.status(), `register ${email}`).toBe(201);
  const login = await api.post(`${API}/session`, { data: { email, password: HIKER_PASSWORD } });
  expect(login.ok(), `login ${email}`).toBeTruthy();
  return { email, fullname, api };
};

/** Somebody else books `seats` seats of the slot, through the API. */
const takeSeats = async (playwright: PlaywrightWorkerArgs['playwright'], day: Day, start: string, seats: number) => {
  const other = await registerHiker(playwright, 'Someone Else');
  try {
    const booked = await other.api.post(`${API}/reservations`, {
      data: { date: day.iso, slot: start, partySize: seats },
    });
    expect(booked.status(), `${seats} seats taken by someone else`).toBe(201);
  } finally {
    await other.api.dispose();
  }
};

/** The hiker's bookings in the given slot. */
const bookingsIn = async (hiker: Hiker, day: Day, start: string): Promise<Booking[]> => {
  const response = await hiker.api.get(`${API}/reservations`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as Booking[]).filter((b) => b.date === day.iso && b.slot === start);
};

/** Free seats of the slot as everyone sees them; a full slot is not listed, so it has 0. */
const freeSeats = async (request: APIRequestContext, day: Day, start: string): Promise<number> => {
  const response = await request.get(`${API}/slots?date=${day.iso}`);
  expect(response.ok()).toBeTruthy();
  const slot = ((await response.json()) as { start_time: string; available_seats: number }[]).find(
    (s) => s.start_time === start,
  );
  return slot?.available_seats ?? 0;
};

/** The emails Mailpit holds for an address. */
const emailsTo = async (request: APIRequestContext, to: string): Promise<MailpitSummary[]> => {
  const response = await request.get(`${MAILPIT_API}/search`, { params: { query: `to:"${to}"`, limit: 50 } });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { messages: MailpitSummary[] }).messages;
};

/** All the emails Mailpit holds (the specs run one at a time, so nobody else sends meanwhile). */
const emailCount = async (request: APIRequestContext): Promise<number> => {
  const response = await request.get(`${MAILPIT_API}/messages`, { params: { limit: 1 } });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { total: number }).total;
};

/** Waits until the address has `count` emails and returns them. */
const waitForEmails = async (request: APIRequestContext, to: string, count: number) => {
  await expect
    .poll(async () => (await emailsTo(request, to)).length, { message: `${count} email(s) to ${to}`, timeout: 10_000 })
    .toBe(count);
  return emailsTo(request, to);
};

/** Watches Mailpit for NO_EMAIL_WINDOW_MS: `count()` must never change from `expected`. */
const expectNoNewEmail = async (count: () => Promise<number>, expected: number, what: string) => {
  const end = Date.now() + NO_EMAIL_WINDOW_MS;
  do {
    expect(await count(), `no new email ${what}`).toBe(expected);
    await new Promise((resolve) => setTimeout(resolve, MAILPIT_POLL_MS));
  } while (Date.now() < end);
  expect(await count(), `no new email ${what}`).toBe(expected);
};

const checkAnswer = (page: Page) => page.getByRole('status').filter({ hasText: /room for/i });

/**
 * As a visitor (logged out): checks DAY, the slot and the party size on the availability page,
 * presses "Book a table" in the answer and arrives on the login page.
 */
const checkAndAskToBook = async (page: Page, day: Day, start: string, party: number) => {
  await page.goto('/availability');
  await page.getByLabel('Day', { exact: true }).fill(day.iso);
  const time = page.getByRole('radiogroup', { name: 'Time' }).getByRole('radio', { name: new RegExp(`^${start}`) });
  await time.click();
  await expect(time).toHaveAttribute('aria-checked', 'true');
  const counter = page.getByText(/^\d+ (person|people)$/);
  let current = parseInt((await counter.textContent()) ?? '', 10);
  while (current !== party) {
    const step = current < party ? 1 : -1;
    await page.getByRole('button', { name: step > 0 ? 'Increase party size' : 'Decrease party size' }).click();
    current += step;
    await expect(counter).toHaveText(people(current));
  }
  await page.getByRole('button', { name: 'Check availability' }).click();
  await expect(checkAnswer(page)).toContainText(new RegExp(`room for ${people(party)}`, 'i'));
  await checkAnswer(page).getByRole('link', { name: 'Book a table' }).click();
  await expect(page).toHaveURL(/\/login$/);
};

/** Fills and sends the login form. */
const signIn = async (page: Page, email: string, password: string) => {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
};

/** Waits for the booking page to have loaded the times of the chosen day. */
const bookingPageReady = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Reserve your table' })).toBeVisible();
  await expect(page.getByText('Loading available times...')).toHaveCount(0);
};

const summary = (page: Page) => page.getByRole('heading', { name: 'Your Reservation' }).locator('xpath=..');
const bookButton = (page: Page) => page.getByRole('button', { name: 'Book Table' });
const receipt = (page: Page) => page.getByText(/Booking #\d+ confirmed/);

/** The booking form shows the checked day, time and party size. */
const expectFormFilledWith = async (page: Page, day: Day, start: string, party: number) => {
  await bookingPageReady(page);
  await expect(summary(page)).toContainText(shortDatePattern(day));
  await expect(summary(page)).toContainText(start);
  await expect(summary(page)).toContainText(`${party} people`);
  await expect(page.getByText(/^\d+ (Person|People)$/)).toHaveText(`${party} ${party === 1 ? 'Person' : 'People'}`);
  await expect(bookButton(page)).toBeEnabled();
};

/** Presses "Book Table" when the form offers it (used where pressing it must not book a second time). */
const pressBookIfOffered = async (page: Page) => {
  await bookingPageReady(page);
  if (await bookButton(page).isEnabled()) {
    await bookButton(page).click();
    await expect(page.getByRole('alertdialog').or(receipt(page))).toBeVisible();
  }
};

test.describe('Booking after log in - the booking page is filled in from the check', () => {
  test('a visitor checks, logs in, presses Book Table and is booked for what was checked', async ({ page, playwright }, testInfo) => {
    // Why: the agreed hand-off - check, log in, find the form filled in, book with one click.
    const day = testDay(testInfo.retry);
    const start = '07:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Happy Path');
    try {
      await checkAndAskToBook(page, day, start, 2);

      await signIn(page, hiker.email, HIKER_PASSWORD);
      await expect(page).toHaveURL(/\/book-table/);
      await expectFormFilledWith(page, day, start, 2);
      await bookButton(page).click();

      await expect(receipt(page)).toBeVisible();
      await expect(page.getByText(start, { exact: true })).toBeVisible();
      await expect(page.getByText('2 Guests')).toBeVisible();
      expect(await bookingsIn(hiker, day, start)).toEqual([expect.objectContaining({ partySize: 2 })]);
      expect(await freeSeats(page.request, day, start)).toBe(SLOT_SEATS - 2);
    } finally {
      await hiker.api.dispose();
    }
  });

  test('the day, the time and the party size are kept exactly, and no food needs are invented', async ({ page, playwright }, testInfo) => {
    // Why: what the hiker checked must be what is booked - a later month, a later time, 7 people.
    const day = testDay(testInfo.retry);
    const start = '08:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Exact Data');
    try {
      await checkAndAskToBook(page, day, start, 7);

      await signIn(page, hiker.email, HIKER_PASSWORD);
      await expectFormFilledWith(page, day, start, 7);
      await expect(page.getByRole('button', { name: 'Add someone with a food need' })).toBeVisible();
      await expect(page.getByRole('group', { name: /^Food needs, need/ })).toHaveCount(0);
      await bookButton(page).click();
      await expect(receipt(page)).toBeVisible();

      const bookings = await bookingsIn(hiker, day, start);
      expect(bookings).toHaveLength(1);
      expect(bookings[0]).toMatchObject({ date: day.iso, slot: start, partySize: 7, requirements: [] });
    } finally {
      await hiker.api.dispose();
    }
  });

  test('the booking made after log in sends one confirmation email with the checked details', async ({ page, playwright, request }, testInfo) => {
    // Why: MH-03 - a booking made through the hand-off is confirmed by email like any other.
    const day = testDay(testInfo.retry);
    const start = '09:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Email Check');
    try {
      await checkAndAskToBook(page, day, start, 3);
      await signIn(page, hiker.email, HIKER_PASSWORD);
      await expectFormFilledWith(page, day, start, 3);
      await bookButton(page).click();
      const bookingId = Number((await receipt(page).textContent())!.match(/#(\d+)/)![1]);
      const reference = `MH-${String(bookingId).padStart(6, '0')}`;

      const [email] = await waitForEmails(request, hiker.email, 1);

      expect(email.Subject).toBe(`Booking confirmed: ${reference}`);
      const message = await (await request.get(`${MAILPIT_API}/message/${email.ID}`)).json();
      const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(day.date);
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
      expect(message.Text).toContain(`Hello ${hiker.fullname},`);
      expect(message.Text).toContain(`Date: ${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`);
      expect(message.Text).toContain(`Time slot: ${start}`);
      expect(message.Text).toContain(`Party size: ${people(3)}`);
      await expectNoNewEmail(async () => (await emailsTo(request, hiker.email)).length, 1, `after the first one to ${hiker.email}`);
    } finally {
      await hiker.api.dispose();
    }
  });
});

test.describe('Booking after log in - the slot changed since the check', () => {
  test('a hiker who already has a booking in that slot is refused and not booked twice', async ({ page, playwright, request }, testInfo) => {
    // Why: a hiker has at most one booking per slot (database.md); the hand-off must not get around it.
    const day = testDay(testInfo.retry);
    const start = '10:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Already Booked');
    try {
      const first = await hiker.api.post(`${API}/reservations`, { data: { date: day.iso, slot: start, partySize: 2 } });
      expect(first.status()).toBe(201);
      await waitForEmails(request, hiker.email, 1);

      await checkAndAskToBook(page, day, start, 2);
      await signIn(page, hiker.email, HIKER_PASSWORD);
      await expectFormFilledWith(page, day, start, 2);
      await bookButton(page).click();

      await expect(page.getByRole('alertdialog')).toContainText(/already have a booking/i);
      await expect(receipt(page)).toHaveCount(0);
      await expectNoNewEmail(async () => (await emailsTo(request, hiker.email)).length, 1, `to ${hiker.email}`);
      expect(await bookingsIn(hiker, day, start)).toHaveLength(1);
      expect(await freeSeats(request, day, start)).toBe(SLOT_SEATS - 2);
    } finally {
      await hiker.api.dispose();
    }
  });

  test('a slot that filled up meanwhile is not booked and the hiker is told', async ({ page, playwright, request }, testInfo) => {
    // Why: a booking never goes beyond the capacity (MH-01); the hiker must learn the time is gone.
    const day = testDay(testInfo.retry);
    const start = '11:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Slot Gone');
    try {
      await checkAndAskToBook(page, day, start, 2);
      await takeSeats(playwright, day, start, SLOT_SEATS);

      await signIn(page, hiker.email, HIKER_PASSWORD);
      await bookingPageReady(page);

      await expect(page.getByRole('status').filter({ hasText: start })).toContainText(/no longer available/i);
      await expect(bookButton(page)).toBeDisabled();
      await expectNoNewEmail(async () => (await emailsTo(request, hiker.email)).length, 0, `to ${hiker.email}`);
      expect(await bookingsIn(hiker, day, start)).toEqual([]);
    } finally {
      await hiker.api.dispose();
    }
  });

  test('with fewer seats left than the party the hiker is told and never booked beyond the free seats', async ({ page, playwright, request }, testInfo) => {
    // Why: 6 were checked but only 4 seats are left; the hiker is told, nothing is booked until they
    // press Book Table, and the slot is never booked beyond its capacity.
    const day = testDay(testInfo.retry);
    const start = '12:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Fewer Seats');
    try {
      await checkAndAskToBook(page, day, start, 6);
      await takeSeats(playwright, day, start, SLOT_SEATS - 4);

      await signIn(page, hiker.email, HIKER_PASSWORD);
      await bookingPageReady(page);

      await expect(page.getByRole('status').filter({ hasText: start })).toContainText(/\b4 seats\b.*left/i);
      await expectNoNewEmail(async () => (await emailsTo(request, hiker.email)).length, 0, `before Book Table to ${hiker.email}`);
      expect(await bookingsIn(hiker, day, start), 'nothing booked before Book Table').toEqual([]);

      await pressBookIfOffered(page);

      for (const booking of await bookingsIn(hiker, day, start)) {
        expect(booking.partySize, 'never more than the 4 free seats').toBeLessThanOrEqual(4);
      }
      expect(await freeSeats(request, day, start)).toBeGreaterThanOrEqual(0);
    } finally {
      await hiker.api.dispose();
    }
  });
});

test.describe('Booking after log in - staff log in instead', () => {
  for (const [role, email, start] of [
    ['an employee', EMPLOYEE, '13:00'],
    ['the warden', WARDEN, '14:00'],
  ] as const) {
    test(`when ${role} logs in from a visitor's check nothing is booked and no email is sent`, async ({ page, playwright, request }, testInfo) => {
      // Why: staff cannot book for themselves; logging in must not create a booking or an email.
      const day = testDay(testInfo.retry);
      await createSlot(playwright, day, start);
      await checkAndAskToBook(page, day, start, 3);
      const emailsBefore = await emailCount(request);

      await signIn(page, email, STAFF_PASSWORD);

      await expectNoNewEmail(() => emailCount(request), emailsBefore, `after the ${role} logged in`);
      expect(await freeSeats(request, day, start)).toBe(SLOT_SEATS);
    });
  }
});

test.describe('Booking after log in - nothing is booked without Book Table', () => {
  test('a visitor who leaves the login page and logs in later is not booked', async ({ page, playwright }, testInfo) => {
    // Why: leaving the hand-off must not leave a booking behind.
    const day = testDay(testInfo.retry);
    const start = '15:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Left Early');
    try {
      await checkAndAskToBook(page, day, start, 2);
      await page.getByRole('banner').getByRole('link', { name: 'Home' }).click();
      await expect(page).toHaveURL(/\/$/);

      await page.getByRole('banner').getByRole('link', { name: 'Login' }).click();
      await signIn(page, hiker.email, HIKER_PASSWORD);
      await bookingPageReady(page);

      expect(await bookingsIn(hiker, day, start)).toEqual([]);
      expect(await freeSeats(page.request, day, start)).toBe(SLOT_SEATS);
    } finally {
      await hiker.api.dispose();
    }
  });

  test('a hiker who sees the filled-in form and leaves without Book Table is not booked', async ({ page, playwright, request }, testInfo) => {
    // Why: the form is only filled in; the booking happens when the hiker presses Book Table.
    const day = testDay(testInfo.retry);
    const start = '16:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Left Form');
    try {
      await checkAndAskToBook(page, day, start, 2);
      await signIn(page, hiker.email, HIKER_PASSWORD);
      await expectFormFilledWith(page, day, start, 2);

      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('menuitem', { name: 'My bookings' }).click();
      await expect(page).toHaveURL(/\/my-bookings$/);

      await expectNoNewEmail(async () => (await emailsTo(request, hiker.email)).length, 0, `to ${hiker.email}`);
      expect(await bookingsIn(hiker, day, start)).toEqual([]);
      expect(await freeSeats(request, day, start)).toBe(SLOT_SEATS);
    } finally {
      await hiker.api.dispose();
    }
  });
});

test.describe('Booking after log in - reloads and repeated clicks', () => {
  test('reloading the login page and the booking page keeps the choice', async ({ page, playwright, request }, testInfo) => {
    // Why: a reload in the middle of the hand-off must not lose what was checked or book twice.
    const day = testDay(testInfo.retry);
    const start = '17:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Reload');
    try {
      await checkAndAskToBook(page, day, start, 5);
      await page.reload();
      await signIn(page, hiker.email, HIKER_PASSWORD);
      await expectFormFilledWith(page, day, start, 5);

      await page.reload();
      await expectFormFilledWith(page, day, start, 5);
      await bookButton(page).click();
      await expect(receipt(page)).toBeVisible();

      await waitForEmails(request, hiker.email, 1);
      expect(await bookingsIn(hiker, day, start)).toEqual([expect.objectContaining({ partySize: 5 })]);
      expect(await freeSeats(request, day, start)).toBe(SLOT_SEATS - 5);
    } finally {
      await hiker.api.dispose();
    }
  });

  test('reloading the receipt and logging in again through the same check never books twice', async ({ page, playwright, request }, testInfo) => {
    // Why: one booking per hiker and slot; the same hand-off used again must not add a second one.
    const day = testDay(testInfo.retry);
    const start = '18:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Twice');
    try {
      await checkAndAskToBook(page, day, start, 2);
      await signIn(page, hiker.email, HIKER_PASSWORD);
      await expectFormFilledWith(page, day, start, 2);
      await bookButton(page).click();
      await expect(receipt(page)).toBeVisible();
      await waitForEmails(request, hiker.email, 1);

      // The receipt page reloaded, and Book Table pressed again if the form offers it
      await page.reload();
      await pressBookIfOffered(page);

      // Logged out, the same check and login again
      await page.context().clearCookies();
      await checkAndAskToBook(page, day, start, 2);
      await signIn(page, hiker.email, HIKER_PASSWORD);
      await pressBookIfOffered(page);

      await expectNoNewEmail(async () => (await emailsTo(request, hiker.email)).length, 1, `after the first one to ${hiker.email}`);
      expect(await bookingsIn(hiker, day, start)).toHaveLength(1);
      expect(await freeSeats(request, day, start)).toBe(SLOT_SEATS - 2);
    } finally {
      await hiker.api.dispose();
    }
  });

  test('a double click on Book Table books once and sends one email', async ({ page, playwright, request }, testInfo) => {
    // Why: an impatient double click on the filled-in form must not create two bookings.
    const day = testDay(testInfo.retry);
    const start = '19:00';
    await createSlot(playwright, day, start);
    const hiker = await registerHiker(playwright, 'Double Click');
    try {
      await checkAndAskToBook(page, day, start, 2);
      await signIn(page, hiker.email, HIKER_PASSWORD);
      await expectFormFilledWith(page, day, start, 2);

      await bookButton(page).dblclick();
      await expect(receipt(page)).toBeVisible();

      await waitForEmails(request, hiker.email, 1);
      await expectNoNewEmail(async () => (await emailsTo(request, hiker.email)).length, 1, `after the first one to ${hiker.email}`);
      expect(await bookingsIn(hiker, day, start)).toHaveLength(1);
      expect(await freeSeats(request, day, start)).toBe(SLOT_SEATS - 2);
    } finally {
      await hiker.api.dispose();
    }
  });
});
