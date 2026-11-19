import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = '/api/v1';
const EMPLOYEE = 'employee@mountainhut.test';
const WARDEN = 'warden@mountainhut.test';
const HIKER = 'mario@mountainhut.test';
const HIKER_NAME = 'Mario Rossi';
const PASSWORD = 'password';
const STAFF_PAGE = '/staff/reserve';
const SLOT_TIME = '12:00';
const SLOT_CAPACITY = 6;
const PARTY_SIZE = 3;

// The suite shares one database. Give every booking scenario and retry its own date.
function bookingDate(scenario: number, retry: number): string {
  const day = new Date();
  day.setDate(day.getDate() + 60 + scenario + 7 * retry);
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function openDesk(page: Page, email = EMPLOYEE) {
  await signIn(page, email);
  await page.getByRole('navigation', { name: 'Staff' }).getByRole('link', { name: 'Reserve for a hiker' }).click();
  await expect(page).toHaveURL(/\/staff\/reserve$/);
  await expect(page.getByRole('heading', { name: 'Reserve for a hiker' })).toBeVisible();
}

async function prepareSlot(page: Page, date: string) {
  // Set up an empty slot through the real API using the staff browser session.
  const response = await page.request.post(`${API}/slots`, {
    data: {
      date,
      startTime: SLOT_TIME,
      endTime: '13:00',
      tables: [{ tableNumber: 1, seats: SLOT_CAPACITY }],
    },
  });
  await expect(response).toBeOK();
}

async function chooseService(page: Page, date: string) {
  await page.getByLabel('Day', { exact: true }).fill(date);
  await page.getByRole('radiogroup', { name: 'Service' }).getByRole('radio', { name: /^12:00/ }).click();
  await page.getByRole('group', { name: 'Quick party size' }).getByRole('button', { name: String(PARTY_SIZE), exact: true }).click();
}

async function selectExistingHiker(page: Page) {
  await page.getByRole('searchbox', { name: 'Search hiker' }).fill(HIKER);
  const result = page.getByRole('list', { name: 'Matching hikers' }).getByRole('listitem').filter({ hasText: HIKER_NAME });
  await result.getByRole('button', { name: 'Select', exact: true }).click();
}

async function reserve(page: Page) {
  await page.getByRole('button', { name: 'Reserve table' }).click();
}

async function expectReceipt(page: Page, name: string) {
  await expect(page.getByRole('heading', { name: 'Reservation made' })).toBeVisible();
  await expect(page.getByText(`for ${name}`, { exact: false })).toBeVisible();
}

async function expectAvailableSeats(page: Page, date: string, count: number) {
  const response = await page.request.get(`${API}/slots`, { params: { date } });
  await expect(response).toBeOK();
  expect(await response.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ start_time: SLOT_TIME, available_seats: count }),
  ]));
}

async function signInHiker(request: APIRequestContext, email: string, password: string) {
  // The request fixture has a separate session from the browser used by staff.
  const login = await request.post(`${API}/session`, { data: { email, password } });
  await expect(login).toBeOK();
  return login;
}

async function expectBookingInHikerAccount(request: APIRequestContext, date: string) {
  const bookings = await request.get(`${API}/reservations`);
  await expect(bookings).toBeOK();
  expect(await bookings.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ date, slot: SLOT_TIME, partySize: PARTY_SIZE }),
  ]));
}

test.describe('Reserve for a hiker (MH-07)', () => {
  test('a visitor is redirected to sign in', async ({ page }) => {
    await page.goto(STAFF_PAGE);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a signed-in hiker cannot open the staff desk', async ({ page }) => {
    await signIn(page, HIKER);
    await expect(page).toHaveURL(/\/book-table$/);
    await page.goto(STAFF_PAGE);
    await expect(page).not.toHaveURL(/\/staff\/reserve$/);
    await expect(page.getByRole('heading', { name: 'Reserve for a hiker' })).toHaveCount(0);
  });

  test('an employee books for an existing hiker', async ({ page, request }, testInfo) => {
    const date = bookingDate(0, testInfo.retry);
    await openDesk(page);
    await prepareSlot(page, date);
    await chooseService(page, date);
    await selectExistingHiker(page);
    await reserve(page);

    await expectReceipt(page, HIKER_NAME);
    await expect(page.getByText('Initial password', { exact: true })).toHaveCount(0);
    await signInHiker(request, HIKER, PASSWORD);
    await expectBookingInHikerAccount(request, date);
  });

  test('a warden books for a quick guest without creating an account', async ({ page }, testInfo) => {
    const date = bookingDate(1, testInfo.retry);
    const name = `Quick Guest ${randomUUID()}`;
    await openDesk(page, WARDEN);
    await prepareSlot(page, date);
    await chooseService(page, date);
    await page.getByRole('tab', { name: 'Quick guest' }).click();
    await expect(page.getByRole('button', { name: 'Reserve table' })).toBeDisabled();
    await page.getByLabel('Full name', { exact: true }).fill(name);
    await reserve(page);

    await expectReceipt(page, name);
    await expect(page.getByText('Initial password', { exact: true })).toHaveCount(0);
    await expectAvailableSeats(page, date, SLOT_CAPACITY - PARTY_SIZE);

    const matches = await page.request.get(`${API}/accounts`, { params: { name } });
    await expect(matches).toBeOK();
    expect(await matches.json()).toEqual([
      expect.objectContaining({ fullname: name, hasAccount: false, id: null, email: null }),
    ]);
  });

  test('an employee creates an account and books for that hiker', async ({ page, request }, testInfo) => {
    const date = bookingDate(2, testInfo.retry);
    const name = 'New Mountain Guest';
    const email = `guest-${randomUUID()}@mountainhut.test`;
    await openDesk(page);
    await prepareSlot(page, date);
    await chooseService(page, date);
    await page.getByRole('tab', { name: 'New account' }).click();
    await page.getByLabel('Full name', { exact: true }).fill(name);
    await page.getByLabel('Mobile number', { exact: true }).fill('+39 333 123 4567');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await reserve(page);

    await expectReceipt(page, name);
    const password = page.getByRole('status').filter({ hasText: 'Initial password' }).locator('code');
    await expect(password).toHaveText(/\S+/);
    const initialPassword = await password.innerText();
    const login = await signInHiker(request, email, initialPassword);
    expect(await login.json()).toMatchObject({ must_change_password: true });

    const passwordChange = await request.put(`${API}/accounts/current/password`, {
      data: { current_password: initialPassword, new_password: `Guest-${randomUUID()}` },
    });
    await expect(passwordChange).toBeOK();
    expect(await passwordChange.json()).toMatchObject({ must_change_password: false });
    await expectBookingInHikerAccount(request, date);
  });

  test('a duplicate booking is refused without taking more seats', async ({ page }, testInfo) => {
    const date = bookingDate(3, testInfo.retry);
    await openDesk(page);
    await prepareSlot(page, date);
    await chooseService(page, date);
    await selectExistingHiker(page);
    await reserve(page);
    await expectReceipt(page, HIKER_NAME);

    await page.getByRole('button', { name: 'New reservation' }).click();
    await chooseService(page, date);
    await selectExistingHiker(page);
    await reserve(page);

    const error = page.getByRole('alertdialog');
    await expect(error.getByRole('heading', { name: 'Reservation not made' })).toBeVisible();
    await expect(error).toContainText(/already has a booking/i);
    await expectAvailableSeats(page, date, SLOT_CAPACITY - PARTY_SIZE);
  });
});
