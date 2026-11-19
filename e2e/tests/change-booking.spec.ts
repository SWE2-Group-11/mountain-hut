import { expect, test, request as apiRequest, type APIRequestContext, type Locator, type Page } from '@playwright/test';

// User story MH-06 - Change a booking.
// A hiker changes the date, time, party size or food needs of a booking from "My bookings".
// The backend runs on one in-memory database for the whole run (see playwright.config.ts), so the specs
// share it. To stay independent:
//   - every test registers its own hikers, so no other spec books for them;
//   - the far bookings use their own days, today + 120 and + 121 (+ 130 / + 131 when CI retries a test, so a
//     retry never finds the seats taken by the first attempt), one slot per test, created by the warden.
//     Every slot has the tables of the seeded slots: T1 = 4, T2 = 4, T3 = 6, T4 = 2 (16 seats). Keep it so:
//     define-slot-capacity.spec.ts looks for that setup ("4 tables · 16 seats") in the list of previous
//     setups, which shows only the most recent slots, and these far-away slots come first in it.
//     T1 and T2 have the same size, so when MH-01 may pick either, the test accepts either;
//   - the bookings less than 48 hours away use the seeded slots of tomorrow (13:00 and 19:30, always
//     between 12 and 44 hours away); no slot is added tomorrow, as define-slot-capacity.spec.ts checks them.

const API = 'http://localhost:3000/api/v1';
const MAILPIT_API = 'http://localhost:8025/api/v1';
const PASSWORD = 'password';
const WARDEN = 'warden@mountainhut.test';
const HIKER_NAME = 'Mia Change';
// Change emails are sent in the background after the response, so "no email" can only be checked over a
// period of time: during this window Mailpit is polled and the number of emails must not change.
const NO_MORE_EMAILS_WINDOW_MS = 3_000;
const MAILPIT_POLL_INTERVAL_MS = 250;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Requirement = { hasAllergies: boolean; details: string };
type Seating = { table_number: number; assigned_seats: number };
type Booking = { id: number; date: string; slot: string; partySize: number; seatings: Seating[]; requirements: Requirement[] };
type PublicSlot = { start_time: string; total_seats: number; available_seats: number };
type Hiker = { email: string; api: APIRequestContext };
type MailpitSummary = { ID: string; Created: string; Subject: string; To: { Address: string }[] };
type MailpitMessage = { Text: string; HTML: string };

/** YYYY-MM-DD of today + n days, in the local time zone. */
const dayFromToday = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const TOMORROW = dayFromToday(1);

/** The two own days of the running test. */
const ownDays = () => {
  const offset = 120 + 10 * test.info().retry;
  return { dayA: dayFromToday(offset), dayB: dayFromToday(offset + 1) };
};

/** "MH-000042" from the booking id, as on the page and in the email. */
const referenceOf = (id: number) => `MH-${String(id).padStart(6, '0')}`;

/** "16 Nov 2026"-like text of a day, as the long date of the card contains it. */
const longDatePattern = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new RegExp(`\\b${day} ${MONTHS[month - 1]} ${year}$`);
};

/** The date as the email writes it. */
const emailDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).formatToParts(new Date(Date.UTC(year, month - 1, day)));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
};


// API sessions opened by a test, closed after it
const opened: APIRequestContext[] = [];
let hikerCount = 0;

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.dispose()));
});

const newApi = async () => {
  const context = await apiRequest.newContext();
  opened.push(context);
  return context;
};

const apiLogin = async (api: APIRequestContext, email: string) => {
  const response = await api.post(`${API}/session`, { data: { email, password: PASSWORD } });
  expect(response.ok(), `login as ${email}`).toBeTruthy();
};

/** Registers a new hiker (unique email) and returns a logged-in API session for it. */
const registerHiker = async (): Promise<Hiker> => {
  hikerCount += 1;
  const email = `mh68.${Date.now()}.${hikerCount}@mountainhut.test`;
  const api = await newApi();
  const response = await api.post(`${API}/accounts`, {
    data: { fullname: HIKER_NAME, mobile_number: '+39 333 000 0000', email, password: PASSWORD },
  });
  expect(response.status(), `register ${email}`).toBe(201);
  await apiLogin(api, email);
  return { email, api };
};

/** The warden creates one-hour slots with the seeded tables: T1 = 4, T2 = 4, T3 = 6, T4 = 2. */
const createSlots = async (date: string, ...starts: string[]) => {
  const warden = await newApi();
  await apiLogin(warden, WARDEN);
  for (const start of starts) {
    const [hours, minutes] = start.split(':');
    const end = `${String(Number(hours) + 1).padStart(2, '0')}:${minutes}`;
    const response = await warden.post(`${API}/slots`, {
      data: {
        date,
        startTime: start,
        endTime: end,
        tables: [
          { tableNumber: 1, seats: 4 },
          { tableNumber: 2, seats: 4 },
          { tableNumber: 3, seats: 6 },
          { tableNumber: 4, seats: 2 },
        ],
      },
    });
    expect(response.status(), `slot ${date} ${start}`).toBe(201);
  }
};

const book = async (hiker: Hiker, date: string, slot: string, partySize: number, requirements?: Requirement[]) => {
  const response = await hiker.api.post(`${API}/reservations`, { data: { date, slot, partySize, requirements } });
  expect(response.status(), `book ${date} ${slot} for ${partySize}`).toBe(201);
  return (await response.json()) as Booking;
};

/** The bookings of the hiker, as the server has them now (GET /reservations). */
const bookingsOf = async (hiker: Hiker): Promise<Booking[]> => {
  const response = await hiker.api.get(`${API}/reservations`);
  expect(response.ok()).toBeTruthy();
  return response.json();
};

const bookingOf = async (hiker: Hiker, id: number) => (await bookingsOf(hiker)).find((b) => b.id === id);

/** Free seats of a slot as everyone sees them; 0 when the public list hides it (full). */
const freeSeats = async (date: string, start: string) => {
  const api = await newApi();
  const response = await api.get(`${API}/slots?date=${date}`);
  expect(response.ok()).toBeTruthy();
  const slot = ((await response.json()) as PublicSlot[]).find((s) => s.start_time === start);
  return slot?.available_seats ?? 0;
};

/** The "Booking changed" emails received by an address (newest first). */
const changeEmailsTo = async (to: string): Promise<MailpitSummary[]> => {
  const api = await newApi();
  const response = await api.get(`${MAILPIT_API}/messages`, { params: { limit: 200 } });
  const { messages } = (await response.json()) as { messages: MailpitSummary[] };
  return messages.filter((m) => m.Subject.startsWith('Booking changed') && m.To.some((r) => r.Address === to));
};

/** Polls Mailpit for NO_MORE_EMAILS_WINDOW_MS: the hiker must have exactly `count` "Booking changed" emails throughout. */
const expectChangeEmailCountStays = async (to: string, count: number) => {
  const end = Date.now() + NO_MORE_EMAILS_WINDOW_MS;
  do {
    expect(await changeEmailsTo(to), `"Booking changed" emails to ${to}`).toHaveLength(count);
    await new Promise((resolve) => setTimeout(resolve, MAILPIT_POLL_INTERVAL_MS));
  } while (Date.now() < end);
  expect(await changeEmailsTo(to), `"Booking changed" emails to ${to}`).toHaveLength(count);
};

/** Waits until the given "Booking changed" email arrives, and returns it. */
const waitForChangeEmail = async (to: string, reference: string) => {
  let found: MailpitSummary | undefined;
  await expect
    .poll(async () => {
      found = (await changeEmailsTo(to)).find((m) => m.Subject === `Booking changed: ${reference}`);
      return found !== undefined;
    }, { message: `"Booking changed: ${reference}" to ${to}`, timeout: 10_000 })
    .toBe(true);
  const api = await newApi();
  const response = await api.get(`${MAILPIT_API}/message/${found!.ID}`);
  return (await response.json()) as MailpitMessage;
};

const login = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
};

const openMyBookings = async (page: Page) => {
  await page.goto('/my-bookings');
  await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible();
  await expect(page.getByText('Loading your bookings...')).toHaveCount(0);
};

/** The card of a booking in "My bookings". */
const card = (page: Page, id: number) =>
  page.getByRole('listitem').filter({ hasText: `Booking ${referenceOf(id)}` });

/** The seats as the card shows them, in table order: "Table 2: 3 · Table 3: 6". */
const seatsText = (seatings: Seating[]) =>
  [...seatings]
    .sort((a, b) => a.table_number - b.table_number)
    .map((s) => `Table ${s.table_number}: ${s.assigned_seats}`)
    .join(' · ');

/** The value shown under a label of the card ("Time", "Party", "Seats"). */
const detail = (bookingCard: Locator, label: string) =>
  bookingCard.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');

/** The food needs listed on the card. */
const foodNeeds = (bookingCard: Locator) => bookingCard.getByRole('listitem');

const startChange = async (page: Page, id: number) => {
  const bookingCard = card(page, id);
  await bookingCard.getByRole('button', { name: 'Change booking' }).click();
  await expect(bookingCard.getByRole('heading', { name: 'Change your booking' })).toBeVisible();
  return bookingCard;
};

const saveChanges = (bookingCard: Locator) => bookingCard.getByRole('button', { name: 'Save changes' }).click();

const changedPopup = (page: Page) => page.getByRole('status').filter({ hasText: 'Booking changed' });
const notChangedAlert = (bookingCard: Locator) => bookingCard.getByRole('alert').filter({ hasText: 'Booking not changed' });

/** Reloads "My bookings", so the cards show what the server saved. */
const reloadMyBookings = async (page: Page) => {
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible();
  await expect(page.getByText('Loading your bookings...')).toHaveCount(0);
};

/** Picks a day in a calendar (change form or booking form), moving month by month from the one shown. */
const pickDate = async (scope: Page | Locator, date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const target = year * 12 + month - 1;
  const shownMonth = scope.getByText(new RegExp(`^(${MONTHS.join('|')}) \\d{4}$`));
  for (let i = 0; i < 24; i++) {
    const text = (await shownMonth.textContent()) ?? '';
    const [name, shownYear] = text.split(' ');
    const shown = Number(shownYear) * 12 + MONTHS.indexOf(name);
    if (shown === target) break;
    await scope.getByRole('button', { name: shown < target ? 'Next month' : 'Previous month' }).click();
    await expect(shownMonth).not.toHaveText(text);
  }
  await scope.getByRole('button', { name: String(day), exact: true }).click();
};

const timeButton = (scope: Page | Locator, start: string) =>
  scope.getByRole('button', { name: new RegExp(`^${start}`) });

/** Presses - or + in the form until the party counter shows n. */
const setPartySize = async (scope: Locator, n: number) => {
  const counter = scope.getByText(/^\d+ (Person|People)$/);
  let current = parseInt((await counter.textContent()) ?? '', 10);
  while (current !== n) {
    const step = current < n ? 1 : -1;
    await scope.getByRole('button', { name: step > 0 ? 'Increase party size' : 'Decrease party size' }).click();
    current += step;
    await expect(counter).toHaveText(`${current} ${current === 1 ? 'Person' : 'People'}`);
  }
};

test.describe('Change a booking - finding it', () => {
  test('a hiker opens a booking from My bookings and sees until when it can be changed', async ({ page }) => {
    // The change starts from the hiker's own list, and nothing is sent until something really changes.
    const { dayA } = ownDays();
    await createSlots(dayA, '08:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '08:00', 2);
    const patches: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PATCH') patches.push(r.url());
    });

    await login(page, hiker.email);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'My bookings' }).click();
    await expect(page).toHaveURL(/\/my-bookings$/);

    const bookingCard = card(page, booking.id);
    await expect(bookingCard.getByRole('heading', { level: 2 })).toHaveText(longDatePattern(dayA));
    await expect(detail(bookingCard, 'Time')).toHaveText('08:00');
    await expect(detail(bookingCard, 'Party')).toHaveText('2 people');
    await expect(detail(bookingCard, 'Seats')).toHaveText('Table 4: 2');
    await expect(bookingCard.getByText(/^You can change this booking until /)).toBeVisible();

    await startChange(page, booking.id);
    await expect(bookingCard.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await expect(bookingCard.getByText('Nothing has changed yet.')).toBeVisible();
    await bookingCard.getByRole('button', { name: 'Discard changes' }).click();
    await expect(bookingCard.getByRole('heading', { name: 'Change your booking' })).toHaveCount(0);
    expect(patches).toEqual([]);
  });
});

test.describe('Change a booking - date and time', () => {
  test('a hiker moves the booking to another time on the same day', async ({ page }) => {
    // The story lets the hiker change the time; the old seats are freed and the new ones taken.
    const { dayA } = ownDays();
    await createSlots(dayA, '09:00', '10:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '09:00', 2);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    await timeButton(bookingCard, '10:00').click();
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toContainText(`Booking ${referenceOf(booking.id)} was updated.`);

    await reloadMyBookings(page);
    await expect(detail(card(page, booking.id), 'Time')).toHaveText('10:00');
    await expect(detail(card(page, booking.id), 'Seats')).toHaveText('Table 4: 2');
    expect(await bookingOf(hiker, booking.id)).toMatchObject({ date: dayA, slot: '10:00', partySize: 2 });
    expect(await freeSeats(dayA, '09:00')).toBe(16);
    expect(await freeSeats(dayA, '10:00')).toBe(14);

    // What every hiker sees in the booking form
    await page.goto('/book-table');
    await pickDate(page, dayA);
    await expect(timeButton(page, '09:00')).toContainText('16 seats left');
    await expect(timeButton(page, '10:00')).toContainText('14 seats left');
  });

  test('a hiker moves the booking to another day', async ({ page }) => {
    // The story lets the hiker change the date; the booking keeps its time and its party.
    const { dayA, dayB } = ownDays();
    await createSlots(dayA, '11:00');
    await createSlots(dayB, '11:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '11:00', 2);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    await pickDate(bookingCard, dayB);
    await timeButton(bookingCard, '11:00').click();
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    await reloadMyBookings(page);
    await expect(card(page, booking.id).getByRole('heading', { level: 2 })).toHaveText(longDatePattern(dayB));
    await expect(detail(card(page, booking.id), 'Time')).toHaveText('11:00');
    expect(await bookingOf(hiker, booking.id)).toMatchObject({ date: dayB, slot: '11:00', partySize: 2 });
    expect(await freeSeats(dayA, '11:00')).toBe(16);
    expect(await freeSeats(dayB, '11:00')).toBe(14);
  });

  test('a far booking can be moved to a slot of tomorrow from the form', async ({ page }) => {
    // Only the original booking needs 48 hours; the new slot only needs the usual 2 hours.
    const { dayA } = ownDays();
    await createSlots(dayA, '20:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '20:00', 1);
    const freeBefore = await freeSeats(TOMORROW, '13:00');

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    await pickDate(bookingCard, TOMORROW);
    await timeButton(bookingCard, '13:00').click();
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    await reloadMyBookings(page);
    const moved = card(page, booking.id);
    await expect(moved.getByRole('heading', { level: 2 })).toHaveText(longDatePattern(TOMORROW));
    await expect(detail(moved, 'Time')).toHaveText('13:00');
    // Now it is less than 48 hours away, so it cannot be changed again
    await expect(moved.getByRole('button', { name: 'Change booking' })).toBeDisabled();
    expect(await bookingOf(hiker, booking.id)).toMatchObject({ date: TOMORROW, slot: '13:00', partySize: 1 });
    expect(await freeSeats(dayA, '20:00')).toBe(16);
    expect(await freeSeats(TOMORROW, '13:00')).toBe(freeBefore - 1);
  });

  test('a far booking can be moved to a slot of tomorrow through the API', async ({ page }) => {
    // On the server itself - a move into a slot 2 to 48 hours away is accepted (200).
    const { dayA } = ownDays();
    await createSlots(dayA, '21:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '21:00', 1);
    const freeBefore = await freeSeats(TOMORROW, '19:30');

    const response = await hiker.api.patch(`${API}/reservations/${booking.id}`, {
      data: { date: TOMORROW, slot: '19:30' },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ id: booking.id, date: TOMORROW, slot: '19:30', partySize: 1 });

    expect(await bookingOf(hiker, booking.id)).toMatchObject({ date: TOMORROW, slot: '19:30' });
    expect(await freeSeats(dayA, '21:00')).toBe(16);
    expect(await freeSeats(TOMORROW, '19:30')).toBe(freeBefore - 1);
    await login(page, hiker.email);
    await openMyBookings(page);
    await expect(detail(card(page, booking.id), 'Time')).toHaveText('19:30');
  });

  test('a booking cannot be moved into a slot where the hiker already has a booking', async ({ page }) => {
    // One booking per hiker per slot; the refused change leaves both bookings as they were.
    const { dayA } = ownDays();
    await createSlots(dayA, '06:00', '07:00');
    const hiker = await registerHiker();
    const first = await book(hiker, dayA, '06:00', 2);
    const second = await book(hiker, dayA, '07:00', 1);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, first.id);
    await timeButton(bookingCard, '07:00').click();
    await saveChanges(bookingCard);
    await expect(notChangedAlert(bookingCard)).toContainText('You already have a reservation in the requested slot');
    await expect(notChangedAlert(bookingCard)).toContainText('Your booking stays as it was.');

    await reloadMyBookings(page);
    await expect(detail(card(page, first.id), 'Time')).toHaveText('06:00');
    await expect(detail(card(page, second.id), 'Time')).toHaveText('07:00');
    expect(await bookingOf(hiker, first.id)).toMatchObject({ slot: '06:00', partySize: 2 });
    expect(await bookingOf(hiker, second.id)).toMatchObject({ slot: '07:00', partySize: 1 });
    expect(await freeSeats(dayA, '06:00')).toBe(14);
    expect(await freeSeats(dayA, '07:00')).toBe(15);
  });
});

test.describe('Change a booking - party size', () => {
  test('a bigger party gets the smallest table that seats everyone', async ({ page }) => {
    // 4 people are seated like a new booking of 4: the smallest single table that fits
    // (T1 or T2, both have 4 seats), not T4 plus another table.
    const { dayA } = ownDays();
    await createSlots(dayA, '12:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '12:00', 2);
    expect(booking.seatings).toEqual([{ table_number: 4, assigned_seats: 2 }]);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    await setPartySize(bookingCard, 4);
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    await reloadMyBookings(page);
    await expect(detail(card(page, booking.id), 'Party')).toHaveText('4 people');
    await expect(detail(card(page, booking.id), 'Seats')).toHaveText(/^Table [12]: 4$/);
    expect(await freeSeats(dayA, '12:00')).toBe(12);
  });

  test('a smaller party is seated again at the smallest table that fits', async ({ page }) => {
    // Going from 4 to 2 is a new booking of 2, so the party moves to T4 (2 seats).
    const { dayA } = ownDays();
    await createSlots(dayA, '13:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '13:00', 4);
    expect(seatsText(booking.seatings)).toMatch(/^Table [12]: 4$/);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    await setPartySize(bookingCard, 2);
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    await reloadMyBookings(page);
    await expect(detail(card(page, booking.id), 'Party')).toHaveText('2 people');
    await expect(detail(card(page, booking.id), 'Seats')).toHaveText('Table 4: 2');
    expect(await freeSeats(dayA, '13:00')).toBe(14);
  });

  test('a bigger party is seated like a new booking even when its own table still has room', async ({ page }) => {
    // The party is not kept at its table: 4 people go to the smallest table that fits.
    const { dayA } = ownDays();
    await createSlots(dayA, '14:00', '15:00');
    const leaving = await registerHiker();
    const staying = await registerHiker();
    const hiker = await registerHiker();
    // The two 4-seat tables are taken, so the hiker's 3 people get T3 (6 seats)
    const leavingBooking = await book(leaving, dayA, '14:00', 4);
    await book(staying, dayA, '14:00', 4);
    const booking = await book(hiker, dayA, '14:00', 3);
    expect(booking.seatings).toEqual([{ table_number: 3, assigned_seats: 3 }]);
    // One of them moves away: a 4-seat table is free again, while T3 still has 3 free seats
    const freedTable = leavingBooking.seatings[0].table_number;
    const moved = await leaving.api.patch(`${API}/reservations/${leavingBooking.id}`, { data: { slot: '15:00' } });
    expect(moved.status(), 'setup: the other hiker moves to 15:00').toBe(200);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    await setPartySize(bookingCard, 4);
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    await reloadMyBookings(page);
    await expect(detail(card(page, booking.id), 'Seats')).toHaveText(`Table ${freedTable}: 4`);
    expect(await freeSeats(dayA, '14:00')).toBe(8);
  });

  test('a party too big for one table takes the largest table first, then the smallest that fits the rest', async ({ page }) => {
    // 9 people: T3 (6), then 3 at a 4-seat table, not three tables.
    const { dayA } = ownDays();
    await createSlots(dayA, '16:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '16:00', 2);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    await setPartySize(bookingCard, 9);
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    await reloadMyBookings(page);
    await expect(detail(card(page, booking.id), 'Party')).toHaveText('9 people');
    await expect(detail(card(page, booking.id), 'Seats')).toHaveText(/^Table [12]: 3 · Table 3: 6$/);
    expect(await freeSeats(dayA, '16:00')).toBe(7);
  });

  test('a bigger party is refused when the seats were taken meanwhile, and the booking stays as it was', async ({ page }) => {
    // Automatic verification of availability - no room means no change at all.
    const { dayA } = ownDays();
    await createSlots(dayA, '17:00');
    const hiker = await registerHiker();
    const crowd = await registerHiker();
    const latecomer = await registerHiker();
    const booking = await book(hiker, dayA, '17:00', 2); // T4
    await book(crowd, dayA, '17:00', 13); // T3 6 + 4 + 3 on the 4-seat tables: one seat left
    expect(await freeSeats(dayA, '17:00')).toBe(1);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    // The form offers the hiker's own 2 seats plus the free one, not more
    await setPartySize(bookingCard, 3);
    await expect(bookingCard.getByRole('button', { name: 'Increase party size' })).toBeDisabled();

    // Someone else books the last seat while the form is open
    await book(latecomer, dayA, '17:00', 1);
    await saveChanges(bookingCard);
    await expect(notChangedAlert(bookingCard)).toContainText('no longer available');
    await expect(notChangedAlert(bookingCard)).toContainText('Your booking stays as it was.');

    await reloadMyBookings(page);
    await expect(detail(card(page, booking.id), 'Party')).toHaveText('2 people');
    await expect(detail(card(page, booking.id), 'Seats')).toHaveText('Table 4: 2');
    expect(await freeSeats(dayA, '17:00')).toBe(0);

    // The server refuses it too when the form is bypassed
    const tooMany = await hiker.api.patch(`${API}/reservations/${booking.id}`, { data: { partySize: 20 } });
    expect(tooMany.status()).toBe(409);
    expect(await bookingOf(hiker, booking.id)).toMatchObject({
      partySize: 2,
      seatings: [{ table_number: 4, assigned_seats: 2 }],
    });
  });
});

test.describe('Change a booking - food needs', () => {
  test('a hiker edits the food needs of a booking', async ({ page }) => {
    // The requirements are part of the booking; the new list replaces the old one, the seats stay.
    const { dayA } = ownDays();
    await createSlots(dayA, '18:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '18:00', 3, [{ hasAllergies: false, details: '1 person: vegan' }]);

    await login(page, hiker.email);
    await openMyBookings(page);
    await expect(foodNeeds(card(page, booking.id))).toHaveText(['1 person: vegan']);
    const bookingCard = await startChange(page, booking.id);
    await bookingCard.getByRole('button', { name: 'Edit food needs' }).click();
    await bookingCard.getByRole('button', { name: 'More people, need 1' }).click();
    await bookingCard.getByRole('button', { name: 'Add another' }).click();
    await bookingCard
      .getByRole('group', { name: 'Food needs, need 2' })
      .getByRole('button', { name: 'Nut allergy', exact: true })
      .click();
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    await reloadMyBookings(page);
    await expect(foodNeeds(card(page, booking.id))).toHaveText(['2 people: vegan', 'Allergy: 1 person: nut allergy']);
    await expect(detail(card(page, booking.id), 'Seats')).toHaveText(seatsText(booking.seatings));
    expect((await bookingOf(hiker, booking.id))?.requirements).toEqual([
      { hasAllergies: false, details: '2 people: vegan' },
      { hasAllergies: true, details: '1 person: nut allergy' },
    ]);
  });

  test('a hiker removes all the food needs of a booking', async ({ page }) => {
    // An empty list removes the requirements, and nothing else of the booking changes.
    const { dayA } = ownDays();
    await createSlots(dayA, '19:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayA, '19:00', 2, [{ hasAllergies: true, details: '1 person: egg allergy' }]);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    await bookingCard.getByRole('button', { name: 'Edit food needs' }).click();
    await bookingCard.getByRole('button', { name: 'Remove need 1' }).click();
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    await reloadMyBookings(page);
    await expect(foodNeeds(card(page, booking.id))).toHaveCount(0);
    await expect(detail(card(page, booking.id), 'Seats')).toHaveText('Table 4: 2');
    expect((await bookingOf(hiker, booking.id))?.requirements).toEqual([]);
  });
});

test.describe('Change a booking - the 48-hour rule', () => {
  test('a booking less than 48 hours away cannot be changed', async ({ page }) => {
    // Any change needs the original booking at least 48 hours away, food needs included.
    const { dayB } = ownDays();
    await createSlots(dayB, '14:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, TOMORROW, '13:00', 1);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = card(page, booking.id);
    await expect(bookingCard.getByRole('button', { name: 'Change booking' })).toBeDisabled();
    await expect(
      bookingCard.getByText('This booking can no longer be changed: changes close 48 hours before it starts.'),
    ).toBeVisible();

    // The server refuses every kind of change, even when the page is bypassed
    const changes = [
      { partySize: 2 },
      { requirements: [{ hasAllergies: false, details: '1 person: vegan' }] },
      { date: dayB, slot: '14:00' },
    ];
    for (const data of changes) {
      const response = await hiker.api.patch(`${API}/reservations/${booking.id}`, { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
      expect((await response.json()).message, JSON.stringify(data)).toMatch(/48 hours/);
    }
    expect(await bookingOf(hiker, booking.id)).toMatchObject({
      date: TOMORROW,
      slot: '13:00',
      partySize: 1,
      requirements: [],
    });
  });
});

test.describe('Change a booking - email', () => {
  test('after a change the hiker receives an email with the new details', async ({ page }) => {
    // The email tells the hiker the booking as it is now (reference, date, time, party, food needs).
    const { dayB } = ownDays();
    await createSlots(dayB, '08:00', '09:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayB, '08:00', 2);
    const reference = referenceOf(booking.id);

    await login(page, hiker.email);
    await openMyBookings(page);
    const bookingCard = await startChange(page, booking.id);
    await timeButton(bookingCard, '09:00').click();
    await setPartySize(bookingCard, 3);
    await bookingCard.getByRole('button', { name: 'Add food needs' }).click();
    await bookingCard.getByRole('button', { name: 'Add someone with a food need' }).click();
    await bookingCard
      .getByRole('group', { name: 'Food needs, need 1' })
      .getByRole('button', { name: 'Vegan', exact: true })
      .click();
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    const message = await waitForChangeEmail(hiker.email, reference);
    // SMTP delivers the text body with CRLF line endings
    const text = message.Text.replace(/\r\n/g, '\n');
    expect(text).toContain(`Hello ${HIKER_NAME},`);
    expect(text).toContain(`Booking reference: ${reference}`);
    expect(text).toContain(`Date: ${emailDate(dayB)}`);
    expect(text).toContain('Time slot: 09:00–10:00');
    expect(text).toContain('Party size: 3 people');
    expect(text).toContain('Party requirements:\n- 1 person: vegan\n');

    // The HTML version, as an email client shows it
    await page.setContent(message.HTML);
    const emailDetail = (label: string) =>
      page.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]');
    await expect(page.getByRole('heading', { name: 'Your booking has been changed' })).toBeVisible();
    await expect(emailDetail('Booking reference')).toHaveText(reference);
    await expect(emailDetail('Date')).toHaveText(emailDate(dayB));
    await expect(emailDetail('Time slot')).toHaveText('09:00–10:00');
    await expect(emailDetail('Party size')).toHaveText('3 people');
  });

  test('a refused change sends no email', async ({ page }) => {
    // Only a saved change is announced. A later saved change shows that emails do arrive.
    const { dayB } = ownDays();
    await createSlots(dayB, '12:00', '13:00');
    const hiker = await registerHiker();
    const booking = await book(hiker, dayB, '12:00', 2);
    await book(hiker, dayB, '13:00', 1);
    const reference = referenceOf(booking.id);

    await login(page, hiker.email);
    await openMyBookings(page);
    let bookingCard = await startChange(page, booking.id);
    await timeButton(bookingCard, '13:00').click();
    await saveChanges(bookingCard);
    await expect(notChangedAlert(bookingCard)).toBeVisible();
    // No email for the refused change, not even a late one
    await expectChangeEmailCountStays(hiker.email, 0);
    await bookingCard.getByRole('button', { name: 'Discard changes' }).click();

    // Then a change that is saved
    bookingCard = await startChange(page, booking.id);
    await setPartySize(bookingCard, 3);
    await saveChanges(bookingCard);
    await expect(changedPopup(page)).toBeVisible();

    // Its email arrives, and no other one follows
    const message = await waitForChangeEmail(hiker.email, reference);
    expect(message.Text).toContain('Time slot: 12:00–13:00');
    expect(message.Text).toContain('Party size: 3 people');
    await expectChangeEmailCountStays(hiker.email, 1);
  });
});
