import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// User story MH-04 - Check availability.
// Anyone (logged in or not) picks a day, one of that day's times and a party size, and the hut
// answers whether the party can be seated, showing which tables and how many seats on each.
//
// The backend runs on one in-memory database for the whole run (see playwright.config.ts), so
// the specs share it. To stay independent, these tests work on days nobody else uses:
//   OWN_DAY   (today + 30): 12:00-13:00 with T1 = 4 and T2 = 4 seats, and 1 seat already booked,
//                           so 7 seats are free (T1 3 + T2 4) out of 8; 19:00-20:00 with T1 = 4.
//   EMPTY_DAY (today + 31): no slots at all.
// Only the first test reads the seeded slots of tomorrow, without booking anything.

const API = 'http://localhost:3000/api/v1';
const PASSWORD = 'password';
const HIKER = 'mario@mountainhut.test';
const EMPLOYEE = 'employee@mountainhut.test';
const WARDEN = 'warden@mountainhut.test';

/** YYYY-MM-DD of today + n days, in the local time zone (as the date field uses it). */
const dayFromToday = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const OWN_DAY = dayFromToday(30);
const EMPTY_DAY = dayFromToday(31);

type PublicSlot = { start_time: string; total_seats: number; available_seats: number };

/** Logs in a separate API session (no browser), used only to prepare the test data. */
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

/** Logs in through the login page, like a user. */
const login = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
};

/** Opens the check page from the header link and waits for it. */
const openCheckFromHeader = async (page: Page) => {
  await page.getByRole('banner').getByRole('link', { name: 'Check availability' }).click();
  await expect(page).toHaveURL(/\/availability$/);
  await expect(page.getByRole('heading', { name: 'Is there a table for us?' })).toBeVisible();
};

/** The "HH:mm – HH:mm" choice of a start time, inside the "Time" group. */
const timeOption = (page: Page, start: string) =>
  page.getByRole('radiogroup', { name: 'Time' }).getByRole('radio', { name: new RegExp(`^${start}`) });

/** Picks a day in the date field and one of its times. */
const chooseSlot = async (page: Page, day: string, start: string) => {
  await page.getByLabel('Day', { exact: true }).fill(day);
  await timeOption(page, start).click();
  await expect(timeOption(page, start)).toHaveAttribute('aria-checked', 'true');
};

const partyLabel = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/** Presses - or + until the counter shows n people. */
const setPartySize = async (page: Page, n: number) => {
  const counter = page.getByText(/^\d+ (person|people)$/);
  let current = parseInt((await counter.textContent()) ?? '', 10);
  while (current !== n) {
    const step = current < n ? 1 : -1;
    await page.getByRole('button', { name: step > 0 ? 'Increase party size' : 'Decrease party size' }).click();
    current += step;
    await expect(counter).toHaveText(partyLabel(current));
  }
};

const checkButton = (page: Page) => page.getByRole('button', { name: 'Check availability' });

/** The answer box: both "Yes, there is room…" and "No room…" are announced as a status. */
const answer = (page: Page) => page.getByRole('status');

const placeholder = (page: Page) => page.getByText(/^Choose a day, a time and the size of your party/);

// Prepares OWN_DAY once. Every step first checks what already exists, so a retried test
// (CI retries once, on the same database) neither creates the slots twice nor books twice.
test.beforeAll(async ({ playwright }) => {
  const warden = await playwright.request.newContext();
  const hiker = await playwright.request.newContext();
  try {
    await apiLogin(warden, WARDEN);
    const existing = (await slotsOf(warden, OWN_DAY)).map((s) => s.start_time);
    if (!existing.includes('12:00')) {
      const created = await warden.post(`${API}/slots`, {
        data: {
          date: OWN_DAY,
          startTime: '12:00',
          endTime: '13:00',
          tables: [
            { tableNumber: 1, seats: 4 },
            { tableNumber: 2, seats: 4 },
          ],
        },
      });
      expect(created.status()).toBe(201);
    }
    if (!existing.includes('19:00')) {
      const created = await warden.post(`${API}/slots`, {
        data: { date: OWN_DAY, startTime: '19:00', endTime: '20:00', tables: [{ tableNumber: 1, seats: 4 }] },
      });
      expect(created.status()).toBe(201);
    }

    // One seat taken, so that "one person too many" can be asked: the + button stops at the
    // total seats of the slot (8), while only 7 are free. The single guest goes to table 1.
    await apiLogin(hiker, HIKER);
    const lunch = (await slotsOf(hiker, OWN_DAY)).find((s) => s.start_time === '12:00');
    if (lunch?.available_seats === 8) {
      const booked = await hiker.post(`${API}/reservations`, {
        data: { date: OWN_DAY, slot: '12:00', partySize: 1 },
      });
      expect(booked.status()).toBe(201);
    }

    const ready = (await slotsOf(hiker, OWN_DAY)).find((s) => s.start_time === '12:00');
    expect(ready).toMatchObject({ total_seats: 8, available_seats: 7 });
  } finally {
    await warden.dispose();
    await hiker.dispose();
  }
});

test.describe('Check availability - a visitor', () => {
  test("a visitor opens the check from the header and sees tomorrow's times", async ({ page }) => {
    // Why: the page is public, reachable from the header, starts on tomorrow and offers the real slots.
    // Arrange
    await page.goto('/');

    // Act
    await openCheckFromHeader(page);

    // Assert
    await expect(page.getByLabel('Day', { exact: true })).toHaveValue(dayFromToday(1));
    await expect(timeOption(page, '12:00')).toBeVisible();
    await expect(timeOption(page, '13:00')).toBeVisible();
    await expect(timeOption(page, '19:30')).toBeVisible();
    await expect(checkButton(page)).toBeDisabled();
  });

  test('a party that fits at one table is shown that table and its seats', async ({ page }) => {
    // Why: the question reaches the server and the answer shows which table and how many seats.
    // Arrange
    await page.goto('/availability');
    await chooseSlot(page, OWN_DAY, '12:00');
    await setPartySize(page, 2);

    // Act
    await checkButton(page).click();

    // Assert: the smallest table that fits is table 1 (3 free seats)
    await expect(answer(page)).toContainText('Yes, there is room for 2 people');
    const tables = answer(page).getByRole('listitem');
    await expect(tables).toHaveCount(1);
    await expect(tables).toContainText('Table 1');
    await expect(tables).toContainText('2 seats');
  });

  test('a party that fills every free seat is split over two tables', async ({ page }) => {
    // Why: the story asks to show the split - which tables and how many seats on each.
    // Arrange
    await page.goto('/availability');
    await chooseSlot(page, OWN_DAY, '12:00');
    await setPartySize(page, 7);

    // Act
    await checkButton(page).click();

    // Assert: 4 on table 2 and 3 on table 1, which adds up to the 7 people
    await expect(answer(page)).toContainText('Yes, there is room for 7 people');
    await expect(answer(page)).toContainText('4 + 3 seats');
    const tables = answer(page).getByRole('listitem');
    await expect(tables).toHaveCount(2);
    await expect(tables.filter({ hasText: 'Table 2' })).toContainText('4 seats');
    await expect(tables.filter({ hasText: 'Table 1' })).toContainText('3 seats');
  });

  test('one person more than the free seats gets a "no room" answer', async ({ page }) => {
    // Why: an empty answer from the server must become a clear "no", with no tables and no booking link.
    // Arrange
    await page.goto('/availability');
    await chooseSlot(page, OWN_DAY, '12:00');
    await setPartySize(page, 8);

    // Act
    await checkButton(page).click();

    // Assert
    await expect(answer(page)).toContainText('No room for 8 people');
    await expect(answer(page).getByRole('listitem')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Book a table', exact: true })).toHaveCount(0);
  });

  test('changing the party size or the time clears the previous answer', async ({ page }) => {
    // Why: an old answer next to new choices would be misleading.
    // Arrange
    await page.goto('/availability');
    await chooseSlot(page, OWN_DAY, '12:00');
    await setPartySize(page, 2);
    await checkButton(page).click();
    await expect(answer(page)).toContainText('Yes, there is room for 2 people');

    // Act + Assert: a new party size
    await page.getByRole('button', { name: 'Increase party size' }).click();
    await expect(answer(page)).toHaveCount(0);
    await expect(placeholder(page)).toBeVisible();

    // Act + Assert: a new time
    await checkButton(page).click();
    await expect(answer(page)).toContainText('Yes, there is room for 3 people');
    await timeOption(page, '19:00').click();
    await expect(answer(page)).toHaveCount(0);
    await expect(placeholder(page)).toBeVisible();
  });

  test('a day without meal service says so and cannot be checked', async ({ page }) => {
    // Why: with no slots there is nothing to ask; the user should be told, not left with an empty form.
    // Arrange
    await page.goto('/availability');

    // Act
    await page.getByLabel('Day', { exact: true }).fill(EMPTY_DAY);

    // Assert
    await expect(page.getByText('No meal service on this day. Try another day.')).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(checkButton(page)).toBeDisabled();
  });

  test('a network failure shows a readable error', async ({ page }) => {
    // Why: if the server can't be reached the user gets a message, not a silent or broken page.
    // Arrange: this one request is made to fail ("mocked"); the rest of the page uses the real backend
    await page.route(/\/slots\/availability\?/, (route) => route.abort());
    await page.goto('/availability');
    await chooseSlot(page, OWN_DAY, '12:00');

    // Act
    await checkButton(page).click();

    // Assert
    await expect(page.getByRole('alert')).toHaveText('Could not check the availability. Please try again.');
    await expect(answer(page)).toHaveCount(0);
  });

  test('a visitor who wants to book is asked to log in and then reaches the booking page', async ({ page }) => {
    // Why: checking needs no login, but booking does; the hand-off must lead to login, then to booking.
    // Arrange
    await page.goto('/availability');
    await chooseSlot(page, OWN_DAY, '12:00');
    await checkButton(page).click();
    await expect(answer(page)).toContainText('Yes, there is room for 2 people');

    // Act
    await answer(page).getByRole('link', { name: 'Book a table' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email address').fill(HIKER);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Assert
    await expect(page).toHaveURL(/\/book-table$/);
    await expect(page.getByRole('heading', { name: 'Reserve your table' })).toBeVisible();
  });
});

test.describe('Check availability - logged in', () => {
  test('a hiker can check and go on to the booking page', async ({ page }) => {
    // Why: the check also works when logged in, and a hiker goes straight to booking.
    // Arrange
    await login(page, HIKER);
    await openCheckFromHeader(page);
    await chooseSlot(page, OWN_DAY, '12:00');

    // Act
    await checkButton(page).click();
    await expect(answer(page)).toContainText('Yes, there is room for 2 people');
    await answer(page).getByRole('link', { name: 'Book a table' }).click();

    // Assert
    await expect(page).toHaveURL(/\/book-table$/);
    await expect(page.getByRole('heading', { name: 'Reserve your table' })).toBeVisible();
  });

  for (const [role, email] of [
    ['an employee', EMPLOYEE],
    ['the warden', WARDEN],
  ] as const) {
    test(`${role} can use the check too`, async ({ page }) => {
      // Why: the check is public, so staff can answer a hiker's question with it.
      // Arrange
      await login(page, email);
      await openCheckFromHeader(page);
      await chooseSlot(page, OWN_DAY, '12:00');

      // Act
      await checkButton(page).click();

      // Assert
      await expect(answer(page)).toContainText('Yes, there is room for 2 people');
      await expect(answer(page).getByRole('listitem')).toContainText('Table 1');
    });
  }
});

test.describe('Check availability - on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the check is in the header menu', async ({ page }) => {
    // Why: on small screens the header links are inside the menu, and this one must be there too.
    // Arrange
    await page.goto('/');
    const menuButton = page.getByRole('button', { name: 'Toggle menu' });

    // Act
    await menuButton.click();
    await page.getByRole('banner').getByRole('link', { name: 'Check availability' }).click();

    // Assert
    await expect(page).toHaveURL(/\/availability$/);
    await expect(page.getByRole('heading', { name: 'Is there a table for us?' })).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });
});
