import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://localhost:3000/api/v1';
const REPEAT_PAGE = '/staff/slots/repeat';
const EMPLOYEE = 'employee@mountainhut.test';
const WARDEN = 'warden@mountainhut.test';
const HIKER = 'mario@mountainhut.test';
const PASSWORD = 'password';
const HUT_TIMEZONE = 'Europe/Rome';

test.use({ timezoneId: HUT_TIMEZONE });

const hutDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: HUT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

function weekStart(offset: number): string {
  const today = hutDate.format(new Date());
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, offset * 7 - (weekday + 6) % 7);
}

type SlotInput = {
  date: string;
  startTime: string;
  endTime: string;
  tables: { tableNumber: number; seats: number }[];
};

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function openRepeatPage(page: Page, email = EMPLOYEE) {
  await signIn(page, email);
  await page.getByRole('navigation', { name: 'Staff' }).getByRole('link', { name: 'Copy a week' }).click();
  await expect(page).toHaveURL(/\/staff\/slots\/repeat$/);
  await expect(page.getByRole('heading', { name: 'Repeat a week' })).toBeVisible();
}

async function createSlot(request: APIRequestContext, slot: SlotInput) {
  const response = await request.post(`${API}/slots`, { data: slot });
  await expect(response).toBeOK();
}

async function configurations(request: APIRequestContext, week: string) {
  const response = await request.get(`${API}/slots/configurations`, {
    params: { from: week, to: addDays(week, 6), limit: 100 },
  });
  await expect(response).toBeOK();
  return await response.json() as (SlotInput & { totalSeats: number })[];
}

async function signInHiker(request: APIRequestContext) {
  const response = await request.post(`${API}/session`, {
    data: { email: HIKER, password: PASSWORD },
  });
  await expect(response).toBeOK();
}

async function book(request: APIRequestContext, slot: SlotInput) {
  const response = await request.post(`${API}/reservations`, {
    data: { date: slot.date, slot: slot.startTime, partySize: 2 },
  });
  await expect(response).toBeOK();
  return await response.json() as { id: number };
}

async function reservations(request: APIRequestContext) {
  const response = await request.get(`${API}/reservations`);
  await expect(response).toBeOK();
  return await response.json() as { id: number; date: string; slot: string }[];
}

const sourcePicker = (page: Page) => page.getByRole('combobox', { name: 'Week to copy' });
const targetWeek = (page: Page, week: string) => page.locator(`#target-${week}`);
const copyButton = (page: Page) => page.getByRole('button', { name: /^Copy to \d+ weeks?$/ });
const confirmation = (page: Page) => page.getByRole('alertdialog', { name: 'Before you copy' });
const confirmCopy = (page: Page) =>
  confirmation(page).getByRole('button', { name: /^Yes, copy to \d+ weeks?$/ }).click();

test.describe('Repeat a weekly schedule (MH-09)', () => {
  test('a visitor is sent to sign in', async ({ page }) => {
    await page.goto(REPEAT_PAGE);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a hiker cannot open the staff page', async ({ page }) => {
    await signIn(page, HIKER);
    await expect(page).toHaveURL(/\/book-table$/);
    await page.goto(REPEAT_PAGE);
    await expect(page).not.toHaveURL(/\/staff\/slots\/repeat$/);
    await expect(page.getByRole('heading', { name: 'Repeat a week' })).toHaveCount(0);
  });

  test('an empty source week cannot be copied', async ({ page }) => {
    await openRepeatPage(page);
    await sourcePicker(page).selectOption(weekStart(-4));
    await expect(page.getByText('This week has no slots', { exact: false })).toBeVisible();

    await targetWeek(page, weekStart(1)).check();
    await expect(copyButton(page)).toBeDisabled();
  });

  test('staff can select and clear future targets, excluding the source week', async ({ page }) => {
    await openRepeatPage(page);
    const targets = page.getByRole('group', { name: 'Weeks that will get the schedule' });
    const nextWeek = weekStart(1);
    await sourcePicker(page).selectOption(nextWeek);

    await expect(targetWeek(page, weekStart(0))).toHaveCount(0);
    await expect(targetWeek(page, nextWeek)).toBeDisabled();
    await page.getByRole('button', { name: 'The next 4 weeks' }).click();
    await expect(targets.getByRole('checkbox', { checked: true })).toHaveCount(4);
    for (const offset of [2, 3, 4, 5]) {
      await expect(targetWeek(page, weekStart(offset))).toBeChecked();
    }
    await sourcePicker(page).selectOption(weekStart(2));
    await expect(targetWeek(page, weekStart(2))).not.toBeChecked();
    await expect(targetWeek(page, weekStart(2))).toBeDisabled();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(targets.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy schedule' })).toBeDisabled();
  });

  test('an employee copies multiple days into two future weeks and replaces an unbooked schedule', async ({
    page, request,
  }, testInfo) => {
    // The Playwright database is shared. Keep both the source and targets separate for each retry.
    const source = weekStart(21 + testInfo.retry);
    const emptyTarget = weekStart(30 + 8 * testInfo.retry);
    const existingTarget = weekStart(31 + 8 * testInfo.retry);
    const mondaySlot = {
      date: source, startTime: '11:30', endTime: '13:00',
      tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 3, seats: 6 }],
    };
    const sundaySlot = {
      date: addDays(source, 6), startTime: '19:00', endTime: '21:00',
      tables: [{ tableNumber: 2, seats: 5 }],
    };
    const oldSlot = {
      date: addDays(existingTarget, 2), startTime: '14:00', endTime: '15:00',
      tables: [{ tableNumber: 1, seats: 2 }],
    };

    await openRepeatPage(page);
    await createSlot(page.request, mondaySlot);
    await createSlot(page.request, sundaySlot);
    await createSlot(page.request, oldSlot);
    await signInHiker(request);
    const booking = await book(request, mondaySlot);
    const originalBookings = await reservations(request);
    expect(originalBookings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: booking.id, date: source, slot: mondaySlot.startTime }),
    ]));

    await sourcePicker(page).selectOption(source);
    await expect(page.getByText('2 slots on 2 days will be copied', { exact: false })).toBeVisible();
    await expect(page.getByText('11:30 - 13:00', { exact: true })).toBeVisible();
    await expect(page.getByText('19:00 - 21:00', { exact: true })).toBeVisible();
    await targetWeek(page, emptyTarget).check();
    await targetWeek(page, existingTarget).check();
    await copyButton(page).click();
    await expect(confirmation(page)).toContainText('completely replaced');

    await confirmation(page).getByRole('button', { name: 'Go back' }).click();
    await expect(confirmation(page)).toHaveCount(0);
    expect(await configurations(page.request, emptyTarget)).toEqual([]);
    expect(await configurations(page.request, existingTarget)).toEqual([{ ...oldSlot, totalSeats: 2 }]);

    await copyButton(page).click();
    await confirmCopy(page);
    const status = page.getByRole('status').filter({ hasText: 'Schedule copied' });
    await expect(status).toContainText('2 slots copied into 2 weeks.');

    for (const target of [emptyTarget, existingTarget]) {
      expect(await configurations(page.request, target)).toEqual([
        { ...sundaySlot, date: addDays(target, 6), totalSeats: 5 },
        { ...mondaySlot, date: target, totalSeats: 10 },
      ]);
    }
    expect(await configurations(page.request, source)).toEqual([
      { ...sundaySlot, totalSeats: 5 },
      { ...mondaySlot, totalSeats: 10 },
    ]);
    expect(await reservations(request)).toEqual(originalBookings);
  });

  test('a booked target prevents the entire copy and removing it allows the copy', async ({
    page, request,
  }, testInfo) => {
    const source = weekStart(24 + testInfo.retry);
    const unbookedTarget = weekStart(34 + 8 * testInfo.retry);
    const bookedTarget = weekStart(35 + 8 * testInfo.retry);
    const sourceSlot = {
      date: addDays(source, 1), startTime: '12:15', endTime: '13:45',
      tables: [{ tableNumber: 3, seats: 7 }],
    };
    const unbookedSlot = {
      date: unbookedTarget, startTime: '11:00', endTime: '12:00',
      tables: [{ tableNumber: 1, seats: 6 }],
    };
    const bookedSlot = { ...unbookedSlot, date: addDays(bookedTarget, 6) };

    await openRepeatPage(page, WARDEN);
    await createSlot(page.request, sourceSlot);
    await createSlot(page.request, unbookedSlot);
    await createSlot(page.request, bookedSlot);
    await signInHiker(request);
    const booking = await book(request, bookedSlot);

    await sourcePicker(page).selectOption(source);
    await expect(page.getByText('12:15 - 13:45', { exact: true })).toBeVisible();
    await targetWeek(page, unbookedTarget).check();
    await targetWeek(page, bookedTarget).check();
    await copyButton(page).click();
    await confirmCopy(page);

    const error = page.getByRole('alertdialog').filter({ hasText: 'Schedule not copied' });
    await expect(error).toContainText('already has bookings');
    await expect(error).toContainText('Nothing was copied');
    const originalBookedWeek = [{ ...bookedSlot, totalSeats: 6 }];
    expect(await configurations(page.request, unbookedTarget)).toEqual([{ ...unbookedSlot, totalSeats: 6 }]);
    expect(await configurations(page.request, bookedTarget)).toEqual(originalBookedWeek);

    await error.getByRole('button', { name: 'Got it' }).click();
    await targetWeek(page, bookedTarget).uncheck();
    await copyButton(page).click();
    await confirmCopy(page);

    const status = page.getByRole('status').filter({ hasText: 'Schedule copied' });
    await expect(status).toContainText('1 slot copied into 1 week.');
    expect(await configurations(page.request, unbookedTarget)).toEqual([
      { ...sourceSlot, date: addDays(unbookedTarget, 1), totalSeats: 7 },
    ]);
    expect(await configurations(page.request, bookedTarget)).toEqual(originalBookedWeek);
    expect(await reservations(request)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: booking.id, date: bookedSlot.date, slot: bookedSlot.startTime }),
    ]));
  });
});