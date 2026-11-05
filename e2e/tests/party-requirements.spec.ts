import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// User story MH-58 - Provide party requirements.
// While booking, a hiker may say which people of the party have food needs or allergies
// ("Food needs" step of the booking form). POST /reservations saves them with the booking and
// returns them; the receipt shows them as the server saved them. The confirmation email that
// lists them is tested in booking-confirmation-email.spec.ts.
//
// The backend runs on one in-memory database for the whole run (see playwright.config.ts), so
// the specs share it. A hiker can book a slot only once, so every test that books uses its own
// slot of OWN_DAY (today + 40), which no other spec uses. Each slot has T1 = 4 and T2 = 2 seats.

const API = 'http://localhost:3000/api/v1';
const PASSWORD = 'password';
const HIKER = 'mario@mountainhut.test';
const WARDEN = 'warden@mountainhut.test';

const OWN_DAY_OFFSET = 40;

/** YYYY-MM-DD of today + n days, in the local time zone (as the booking form sends it). */
const dayFromToday = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const OWN_DAY = dayFromToday(OWN_DAY_OFFSET);

// One slot per test: [start, end]
const SLOTS = {
  formLimits: ['08:00', '09:00'],
  allergy: ['09:00', '10:00'],
  blankNote: ['10:00', '11:00'],
  apiSaved: ['11:00', '12:00'],
  apiInvalid: ['12:00', '13:00'],
} as const;

type PublicSlot = { start_time: string; total_seats: number; available_seats: number };

/** Logs in a separate API session (no browser). */
const apiLogin = async (api: APIRequestContext, email: string) => {
  const response = await api.post(`${API}/session`, { data: { email, password: PASSWORD } });
  expect(response.ok(), `login as ${email}`).toBeTruthy();
};

/** The slots of a day as everyone sees them (public endpoint). */
const slotsOf = async (api: APIRequestContext, date: string): Promise<PublicSlot[]> => {
  const response = await api.get(`${API}/slots?date=${date}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
};

const login = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
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

/** Presses - or + until the party counter shows n. */
const setPartySize = async (page: Page, n: number) => {
  const counter = page.getByText(/^\d+ (Person|People)$/);
  let current = parseInt((await counter.textContent()) ?? '', 10);
  while (current !== n) {
    const step = current < n ? 1 : -1;
    await page.getByRole('button', { name: step > 0 ? 'Increase party size' : 'Decrease party size' }).click();
    current += step;
    await expect(counter).toHaveText(`${current} ${current === 1 ? 'Person' : 'People'}`);
  }
};

/** Logs in as the hiker and fills date, time and party size of the booking form. */
const openBookingForm = async (page: Page, start: string, partySize: number) => {
  await login(page, HIKER);
  await expect(page).toHaveURL(/\/book-table$/);
  await pickDay(page, OWN_DAY_OFFSET);
  await page.getByRole('button', { name: new RegExp(`^${start}`) }).click();
  await setPartySize(page, partySize);
};

const bookButton = (page: Page) => page.getByRole('button', { name: 'Book Table' });
const tag = (page: Page, need: number, name: string) =>
  page.getByRole('group', { name: `Food needs, need ${need}` }).getByRole('button', { name, exact: true });
const allergyBox = (page: Page, need: number) =>
  page.getByRole('checkbox', { name: /This is an allergy/ }).nth(need - 1);
/** The people counter of a note, between its - and + buttons. */
const noteCount = (page: Page, need: number) =>
  page.getByRole('group', { name: 'How many people?' }).nth(need - 1).locator('[aria-live="polite"]');

// Creates the slots of OWN_DAY once. A retried test (CI retries once, on the same database)
// finds them already there.
test.beforeAll(async ({ playwright }) => {
  const warden = await playwright.request.newContext();
  try {
    await apiLogin(warden, WARDEN);
    const existing = (await slotsOf(warden, OWN_DAY)).map((s) => s.start_time);
    for (const [startTime, endTime] of Object.values(SLOTS)) {
      if (existing.includes(startTime)) continue;
      const created = await warden.post(`${API}/slots`, {
        data: {
          date: OWN_DAY,
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

test.describe('Party requirements - booking form', () => {
  test('the notes never cover more people than the party', async ({ page }) => {
    // Why: each note says how many people it is for, and together they cannot exceed the party.
    await openBookingForm(page, SLOTS.formLimits[0], 3);

    await page.getByRole('button', { name: 'Add someone with a food need' }).click();
    await expect(noteCount(page, 1)).toHaveText('1');
    await page.getByRole('button', { name: 'More people, need 1' }).click();
    await expect(noteCount(page, 1)).toHaveText('2');
    await tag(page, 1, 'Vegetarian').click();
    await expect(tag(page, 1, 'Vegetarian')).toHaveAttribute('aria-pressed', 'true');

    // The second note gets the one person left, and cannot grow past it
    await page.getByRole('button', { name: 'Add another' }).click();
    await expect(noteCount(page, 2)).toHaveText('1');
    await expect(page.getByRole('button', { name: 'More people, need 2' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: 'All 3 people are covered.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add another' })).toBeDisabled();

    // Removing a note frees its people again
    await page.getByRole('button', { name: 'Remove need 2' }).click();
    await expect(page.getByRole('group', { name: 'How many people?' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Add another' })).toBeEnabled();
    await expect(page.getByText(/people are covered/)).toHaveCount(0);
    await expect(bookButton(page)).toBeEnabled();

    // A smaller party than the notes describe cannot be booked
    await setPartySize(page, 1);
    await expect(
      page.getByRole('alert').filter({ hasText: 'You listed 2 people, but your party has 1.' }),
    ).toBeVisible();
    await expect(bookButton(page)).toBeDisabled();

    // Lowering the note fixes it
    await page.getByRole('button', { name: 'Fewer people, need 1' }).click();
    await expect(noteCount(page, 1)).toHaveText('1');
    await expect(page.getByText(/^You listed/)).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'All 1 person is covered.' })).toBeVisible();
    await expect(bookButton(page)).toBeEnabled();
  });

  test('an allergy cannot be booked without saying which one', async ({ page }) => {
    // Why: the kitchen must know the allergy; an allergy note without a description is not accepted.
    await openBookingForm(page, SLOTS.allergy[0], 2);
    const missingAllergy = page
      .getByRole('alert')
      .filter({ hasText: 'Tell us which allergy it is: pick one above or write it.' });

    await page.getByRole('button', { name: 'Add someone with a food need' }).click();
    await expect(bookButton(page)).toBeEnabled();
    await allergyBox(page, 1).check();
    await expect(missingAllergy).toBeVisible();
    await expect(bookButton(page)).toBeDisabled();

    // Writing it is enough
    await page.getByLabel('Anything else? (optional)').first().fill('sesame');
    await expect(missingAllergy).toHaveCount(0);
    await expect(bookButton(page)).toBeEnabled();

    // Only spaces do not count as a description
    await page.getByLabel('Anything else? (optional)').first().fill('   ');
    await expect(missingAllergy).toBeVisible();
    await expect(bookButton(page)).toBeDisabled();

    // Picking an allergy ticks the box by itself, and describes the allergy
    await page.getByRole('button', { name: 'Add another' }).click();
    await expect(allergyBox(page, 2)).not.toBeChecked();
    await tag(page, 2, 'Egg allergy').click();
    await expect(allergyBox(page, 2)).toBeChecked();
    await expect(missingAllergy).toHaveCount(1); // still the first note only
  });

  test('a note left empty is not sent with the booking', async ({ page }) => {
    // Why: adding a note and leaving it blank must not block the booking nor save an empty requirement.
    await openBookingForm(page, SLOTS.blankNote[0], 2);
    await page.getByRole('button', { name: 'Add someone with a food need' }).click();
    await expect(bookButton(page)).toBeEnabled();

    const request = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/reservations'));
    await bookButton(page).click();
    expect((await request).postDataJSON()).not.toHaveProperty('requirements');

    await expect(page.getByText(/Booking #\d+ confirmed/)).toBeVisible();
    await expect(page.getByText('Dietary needs')).toHaveCount(0);
  });
});

test.describe('Party requirements - POST /reservations', () => {
  test('the requirements are saved with the booking and returned', async ({ playwright }) => {
    // Why: the response carries what the server saved, in the order given, with the details trimmed.
    const hiker = await playwright.request.newContext();
    try {
      await apiLogin(hiker, HIKER);
      const response = await hiker.post(`${API}/reservations`, {
        data: {
          date: OWN_DAY,
          slot: SLOTS.apiSaved[0],
          partySize: 3,
          requirements: [
            { hasAllergies: true, details: '1 person: peanut allergy' },
            { hasAllergies: false, details: '  2 people: vegetarian  ' },
          ],
        },
      });
      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body).toMatchObject({ date: OWN_DAY, slot: SLOTS.apiSaved[0], partySize: 3 });
      expect(body.requirements).toEqual([
        { hasAllergies: true, details: '1 person: peanut allergy' },
        { hasAllergies: false, details: '2 people: vegetarian' },
      ]);
    } finally {
      await hiker.dispose();
    }
  });

  test('invalid requirements are refused and book nothing', async ({ playwright }) => {
    // Why: a malformed requirement rejects the whole booking, so no booking without its requirements exists.
    const hiker = await playwright.request.newContext();
    const slot = SLOTS.apiInvalid[0];
    try {
      await apiLogin(hiker, HIKER);
      const invalid: unknown[] = [
        { hasAllergies: true, details: '' },
        { hasAllergies: false, details: '   ' },
        { hasAllergies: true },
        { details: '2 people: vegetarian' },
        { hasAllergies: 'yes', details: '1 person: nut allergy' },
      ];
      for (const requirement of invalid) {
        const response = await hiker.post(`${API}/reservations`, {
          data: { date: OWN_DAY, slot, partySize: 2, requirements: [requirement] },
        });
        expect(response.status(), JSON.stringify(requirement)).toBe(400);
      }
      const notAList = await hiker.post(`${API}/reservations`, {
        data: { date: OWN_DAY, slot, partySize: 2, requirements: { hasAllergies: false, details: 'vegan' } },
      });
      expect(notAList.status()).toBe(400);

      // No seat was taken, and the hiker can still book the slot (one booking per slot)
      expect((await slotsOf(hiker, OWN_DAY)).find((s) => s.start_time === slot)).toMatchObject({
        total_seats: 6,
        available_seats: 6,
      });
      const booked = await hiker.post(`${API}/reservations`, { data: { date: OWN_DAY, slot, partySize: 2 } });
      expect(booked.status()).toBe(201);
      expect((await booked.json()).requirements).toEqual([]);
    } finally {
      await hiker.dispose();
    }
  });
});
