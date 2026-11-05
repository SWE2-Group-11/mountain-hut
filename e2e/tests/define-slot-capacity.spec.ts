import { expect, test, type Page } from '@playwright/test';

// User story MH-02 - Define slot capacity.
// The employee (or the warden) opens a slot for a day and time and says which tables, with how
// many seats, are available in it - either by typing them or by reusing a previous setup.
//
// The backend runs on a fresh in-memory database for the whole run (see playwright.config.ts),
// so the tests share it. To stay independent, each test works on its own day, far from the
// seeded slots (tomorrow and the day after).

const API = 'http://localhost:3000/api/v1';
const PASSWORD = 'password';
const EMPLOYEE = 'employee@mountainhut.test';
const WARDEN = 'warden@mountainhut.test';
const HIKER = 'mario@mountainhut.test';

/** YYYY-MM-DD of today + n days, in the local time zone (as the date picker uses it). */
const dayFromToday = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const login = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const openSlotSetup = async (page: Page, email = EMPLOYEE) => {
  await login(page, email);
  await expect(page).toHaveURL(/\/staff\/slots$/);
  await expect(page.getByRole('heading', { name: 'Set up slots' })).toBeVisible();
};

const setWhen = async (page: Page, date: string, from: string, to: string) => {
  await page.locator('#slot-date').fill(date);
  await page.locator('#slot-start').fill(from);
  await page.locator('#slot-end').fill(to);
};

/** Types one table in the given row (1-based). */
const fillTable = async (page: Page, row: number, tableNumber: number, seats: number) => {
  await page.getByLabel(`Table number, row ${row}`).fill(String(tableNumber));
  await page.getByLabel(`Seats, row ${row}`).fill(String(seats));
};

const createSlot = (page: Page) => page.getByRole('button', { name: 'Create slot' }).click();

/** The slots of a day as the hikers see them (public endpoint). */
const slotsOf = async (page: Page, date: string) => {
  const response = await page.request.get(`${API}/slots?date=${date}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as Array<{
    start_time: string;
    duration: number;
    total_seats: number;
    available_seats: number;
  }>;
};

test.describe('Define slot capacity - who can open the page', () => {
  test('a visitor is sent to the login page', async ({ page }) => {
    await page.goto('/staff/slots');

    await expect(page).toHaveURL(/\/login$/);
  });

  test('a hiker cannot use the page and has no link to it', async ({ page }) => {
    await login(page, HIKER);
    await expect(page).toHaveURL(/\/book-table$/);
    await expect(page.getByRole('banner').getByRole('link', { name: 'Manage slots' })).toHaveCount(0);

    await page.goto('/staff/slots');

    await expect(page).not.toHaveURL(/\/staff\/slots$/);
    await expect(page.getByRole('heading', { name: 'Set up slots' })).toHaveCount(0);
  });

  test('the employee is taken to the page after login and sees the link to it', async ({ page }) => {
    await openSlotSetup(page, EMPLOYEE);

    await expect(page.getByRole('banner').getByRole('link', { name: 'Manage slots' })).toBeVisible();
  });

  test('the warden can use the page too', async ({ page }) => {
    await openSlotSetup(page, WARDEN);

    await expect(page.getByRole('button', { name: 'Create slot' })).toBeVisible();
  });
});

test.describe('Define slot capacity - define the tables', () => {
  test('the employee opens a slot with its tables and the hikers can see its capacity', async ({ page }) => {
    const day = dayFromToday(10);
    await openSlotSetup(page);

    await setWhen(page, day, '12:00', '13:30');
    await fillTable(page, 1, 1, 4);
    await page.getByRole('button', { name: 'Add table' }).click();
    await fillTable(page, 2, 2, 6);
    await expect(page.getByText('Total:')).toContainText('10');
    await createSlot(page);

    await expect(page.getByText('Created in this session')).toBeVisible();
    await expect(page.getByText(`${day} · 12:00-13:30`)).toBeVisible();
    await expect(page.getByText('2 tables · 10 seats')).toBeVisible();

    // The slot really exists: it is what the hikers get from the booking page
    expect(await slotsOf(page, day)).toEqual([
      { date: day, start_time: '12:00', duration: 90, total_seats: 10, available_seats: 10 },
    ]);
  });

  test('two slots one after the other on the same day are accepted', async ({ page }) => {
    const day = dayFromToday(11);
    await openSlotSetup(page);

    await setWhen(page, day, '12:00', '13:00');
    await fillTable(page, 1, 1, 4);
    await createSlot(page);
    await expect(page.getByText(`${day} · 12:00-13:00`)).toBeVisible();

    // The form keeps the day and the tables and starts the next slot when the first one ends
    await expect(page.locator('#slot-start')).toHaveValue('13:00');
    await page.locator('#slot-end').fill('14:00');
    await createSlot(page);

    await expect(page.getByText(`${day} · 13:00-14:00`)).toBeVisible();
    const slots = await slotsOf(page, day);
    expect(slots.map((s) => s.start_time)).toEqual(['12:00', '13:00']);
  });
});

test.describe('Define slot capacity - reuse a previous setup', () => {
  test('the previous setups are listed and one can be copied into a new slot', async ({ page }) => {
    const day = dayFromToday(12);
    await openSlotSetup(page);

    await page.getByRole('tab', { name: 'Use a previous setup' }).click();
    // The list starts with the most recent slots, so the seeded setup (four tables, 16 seats)
    // is found by what it contains and not by its position
    const seededSetup = page.getByRole('radio').filter({ hasText: '4 tables · 16 seats' }).first();
    await expect(seededSetup).toBeVisible();
    await expect(seededSetup).toContainText('T1: 4');
    await expect(seededSetup).toContainText('T3: 6');

    await seededSetup.click();
    await expect(seededSetup).toHaveAttribute('aria-checked', 'true');
    await setWhen(page, day, '19:00', '20:30');
    await createSlot(page);

    await expect(page.getByText(`${day} · 19:00-20:30`)).toBeVisible();
    await expect(page.getByText('4 tables · 16 seats').last()).toBeVisible();
    expect(await slotsOf(page, day)).toEqual([
      { date: day, start_time: '19:00', duration: 90, total_seats: 16, available_seats: 16 },
    ]);
  });

  test('"Edit as new" copies the tables of a previous setup into the editor', async ({ page }) => {
    await openSlotSetup(page);

    await page.getByRole('tab', { name: 'Use a previous setup' }).click();
    const seededSetup = page.getByRole('listitem').filter({ hasText: '4 tables · 16 seats' }).first();
    await expect(seededSetup).toBeVisible();
    await seededSetup.getByRole('button', { name: 'Edit as new' }).click();

    await expect(page.getByRole('tab', { name: 'Define the tables' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Table number, row 1')).toHaveValue('1');
    await expect(page.getByLabel('Seats, row 1')).toHaveValue('4');
    await expect(page.getByLabel('Table number, row 4')).toHaveValue('4');
    await expect(page.getByLabel('Seats, row 4')).toHaveValue('2');
    await expect(page.getByText('Total:')).toContainText('16');
  });

  test('without choosing a setup the slot is not created', async ({ page }) => {
    const day = dayFromToday(13);
    await openSlotSetup(page);

    await page.getByRole('tab', { name: 'Use a previous setup' }).click();
    await expect(page.getByRole('radio').first()).toBeVisible();
    await setWhen(page, day, '12:00', '13:00');
    await createSlot(page);

    await expect(page.getByRole('alert')).toHaveText('Choose one of the previous setups.');
    expect(await slotsOf(page, day)).toEqual([]);
  });
});

test.describe('Define slot capacity - mistakes are explained', () => {
  test('an end time that is not after the start time', async ({ page }) => {
    const day = dayFromToday(14);
    await openSlotSetup(page);

    await setWhen(page, day, '13:00', '12:00');
    await fillTable(page, 1, 1, 4);
    await createSlot(page);

    await expect(page.getByRole('alert')).toHaveText('The end time must be after the start time.');
    expect(await slotsOf(page, day)).toEqual([]);
  });

  test('a table without seats', async ({ page }) => {
    const day = dayFromToday(15);
    await openSlotSetup(page);

    await setWhen(page, day, '12:00', '13:00');
    await page.getByLabel('Table number, row 1').fill('1');
    await createSlot(page);

    await expect(page.getByRole('alert')).toHaveText('Row 1: the seats must be a positive whole number.');
    expect(await slotsOf(page, day)).toEqual([]);
  });

  test('the same table number twice', async ({ page }) => {
    const day = dayFromToday(16);
    await openSlotSetup(page);

    await setWhen(page, day, '12:00', '13:00');
    await fillTable(page, 1, 1, 4);
    await page.getByRole('button', { name: 'Add table' }).click();
    await fillTable(page, 2, 1, 6);
    await createSlot(page);

    await expect(page.getByRole('alert')).toHaveText('Table 1 appears more than once.');
    expect(await slotsOf(page, day)).toEqual([]);
  });

  test('a slot that overlaps an existing one is refused by the server', async ({ page }) => {
    // The seeded slot of tomorrow runs from 12:00 to 13:00
    const tomorrow = dayFromToday(1);
    await openSlotSetup(page);

    await setWhen(page, tomorrow, '12:30', '13:30');
    await fillTable(page, 1, 1, 4);
    await createSlot(page);

    const popup = page.getByRole('alertdialog');
    await expect(popup).toContainText('Slot not created');
    await expect(popup).toContainText('overlaps an existing slot');
    await popup.getByRole('button', { name: 'Got it' }).click();
    await expect(popup).toHaveCount(0);

    // Nothing was added: tomorrow keeps its three seeded slots
    expect((await slotsOf(page, tomorrow)).map((s) => s.start_time)).toEqual(['12:00', '13:00', '19:30']);
  });
});

test.describe('Define slot capacity - flexible slots', () => {
  test('slots can have any start time and duration', async ({ page }) => {
    const day = dayFromToday(17);
    await openSlotSetup(page);

    await setWhen(page, day, '11:15', '12:00');
    await fillTable(page, 1, 1, 4);
    await createSlot(page);
    await expect(page.getByText(`${day} · 11:15-12:00`)).toBeVisible();

    await setWhen(page, day, '17:30', '21:00');
    await createSlot(page);
    await expect(page.getByText(`${day} · 17:30-21:00`)).toBeVisible();

    const slots = await slotsOf(page, day);
    expect(slots.map((s) => [s.start_time, s.duration])).toEqual([
      ['11:15', 45],
      ['17:30', 210],
    ]);
  });

  test('lunch and dinner of the same day can have different tables', async ({ page }) => {
    const day = dayFromToday(18);
    await openSlotSetup(page);

    // Lunch: one table of 4
    await setWhen(page, day, '12:00', '13:00');
    await fillTable(page, 1, 1, 4);
    await createSlot(page);
    await expect(page.getByText(`${day} · 12:00-13:00`)).toBeVisible();

    // Dinner: the form still holds the lunch tables, which are changed here
    await setWhen(page, day, '19:00', '20:30');
    await fillTable(page, 1, 1, 6);
    await page.getByRole('button', { name: 'Add table' }).click();
    await fillTable(page, 2, 2, 2);
    await createSlot(page);
    await expect(page.getByText(`${day} · 19:00-20:30`)).toBeVisible();

    const slots = await slotsOf(page, day);
    expect(slots.map((s) => [s.start_time, s.total_seats])).toEqual([
      ['12:00', 4],
      ['19:00', 8],
    ]);
  });
});

test.describe('Define slot capacity - the hut does not accept more than it can serve', () => {
  test('a hiker can book up to the capacity defined by the employee, not beyond', async ({ page, playwright }) => {
    const day = dayFromToday(19);
    await openSlotSetup(page);

    await setWhen(page, day, '12:00', '13:00');
    await fillTable(page, 1, 1, 2);
    await page.getByRole('button', { name: 'Add table' }).click();
    await fillTable(page, 2, 2, 2);
    await createSlot(page);
    await expect(page.getByText('2 tables · 4 seats')).toBeVisible();

    // The hiker has a session of their own, separate from the employee's
    const hiker = await playwright.request.newContext();
    try {
      const login = await hiker.post(`${API}/session`, { data: { email: HIKER, password: PASSWORD } });
      expect(login.ok()).toBeTruthy();

      // Five people do not fit in four seats
      const tooMany = await hiker.post(`${API}/reservations`, { data: { date: day, slot: '12:00', partySize: 5 } });
      expect(tooMany.status()).toBe(409);

      // Four people fill the slot, which is then no longer offered
      const full = await hiker.post(`${API}/reservations`, { data: { date: day, slot: '12:00', partySize: 4 } });
      expect(full.status()).toBe(201);
      expect(await slotsOf(page, day)).toEqual([]);
    } finally {
      await hiker.dispose();
    }
  });
});