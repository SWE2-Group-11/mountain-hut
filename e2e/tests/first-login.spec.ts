import { expect, test, request as apiRequest, type APIRequestContext, type Page } from '@playwright/test';

// MH-171 - First login after employee registration (backend MH-172, UI MH-173).
// Requirement (MH-07 clarification): an account created by staff gets a random password that is told to
// the hiker; the hiker must change it at the next login and can always recover it by email (links last 24 hours).
// The backend runs on one in-memory database for the whole run (see playwright.config.ts). To stay independent:
//   - every test creates its own hiker (unique email), through a staff booking in "registered" mode;
//   - the slots are on this spec's own days, today + 100 and + 101 (+ 105 / + 106 when CI retries a test, so a
//     retry never finds the seats taken by the first attempt), one start time per test, created by the warden
//     with the tables of the seeded slots: T1 = 4, T2 = 4, T3 = 6, T4 = 2;
//   - emails are read from Mailpit by recipient and received time (the inbox is shared and never cleared).

const API = 'http://localhost:3000/api/v1';
const MAILPIT_API = 'http://localhost:8025/api/v1';
const APP_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'password';
const EMPLOYEE = 'employee@mountainhut.test';
const WARDEN = 'warden@mountainhut.test';
const RESET_SUBJECT = 'Reset your Mountain Hut password';
const NEW_PASSWORD = 'my own secret 42';
// Reset emails are sent in the background after the response, so "no email" can only be checked over a
// period of time: during this window Mailpit is polled and no email to the address may appear.
const NO_EMAIL_WINDOW_MS = 3_000;
const MAILPIT_POLL_INTERVAL_MS = 250;

type StaffHiker = { email: string; name: string; initialPassword: string };
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

/** The own days of the running test (n days after the first one). */
const ownDayOffset = (n = 0) => 100 + 5 * test.info().retry + n;
const ownDay = (n = 0) => dayFromToday(ownDayOffset(n));

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

const apiLogin = async (api: APIRequestContext, email: string, password = PASSWORD) => {
  const response = await api.post(`${API}/session`, { data: { email, password } });
  expect(response.status(), `login as ${email}`).toBe(201);
  return response.json();
};

/** The warden creates a one-hour slot with the seeded tables, unless a previous attempt already did. */
const ensureSlot = async (date: string, start: string) => {
  const warden = await newApi();
  await apiLogin(warden, WARDEN);
  const existing = (await (await warden.get(`${API}/slots`, { params: { date } })).json()) as { start_time: string }[];
  if (existing.some((slot) => slot.start_time === start)) return;
  const [hours, minutes] = start.split(':');
  const response = await warden.post(`${API}/slots`, {
    data: {
      date,
      startTime: start,
      endTime: `${String(Number(hours) + 1).padStart(2, '0')}:${minutes}`,
      tables: [
        { tableNumber: 1, seats: 4 },
        { tableNumber: 2, seats: 4 },
        { tableNumber: 3, seats: 6 },
        { tableNumber: 4, seats: 2 },
      ],
    },
  });
  expect(response.status(), `slot ${date} ${start}`).toBe(201);
};

const uniqueEmail = () => {
  hikerCount += 1;
  return `mh175.${Date.now()}.${hikerCount}@mountainhut.test`;
};

/** The employee books the given slot of the own day in "registered" mode: creates the hiker account. */
const createHikerByStaff = async (start: string): Promise<StaffHiker> => {
  const date = ownDay();
  await ensureSlot(date, start);
  const employee = await newApi();
  await apiLogin(employee, EMPLOYEE);
  const email = uniqueEmail();
  const name = 'Anna First';
  const response = await employee.post(`${API}/reservations`, {
    data: {
      date,
      slot: start,
      partySize: 1,
      hiker: { mode: 'registered', fullname: name, mobile_number: '+39 333 111 2222', email },
    },
  });
  expect(response.status(), `staff booking for ${email}`).toBe(201);
  const { initialPassword } = (await response.json()) as { initialPassword: string };
  expect(initialPassword, 'initial password in the staff booking').toBeTruthy();
  return { email, name, initialPassword };
};

const signIn = async (page: Page, email: string, password: string) => {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const expectOnChangePasswordPage = async (page: Page) => {
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
};

const fillChangePassword = async (page: Page, current: string, next: string, repeat = next) => {
  await page.locator('#current-password').fill(current);
  await page.locator('#new-password').fill(next);
  await page.locator('#confirm-password').fill(repeat);
  await page.getByRole('button', { name: 'Save and continue' }).click();
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

/** The Mailpit messages to `to` received since `since`. */
const emailsTo = async (to: string, since: Date): Promise<MailpitSummary[]> => {
  const mailpit = await newApi();
  const response = await mailpit.get(`${MAILPIT_API}/messages`, { params: { limit: 200 } });
  const { messages } = (await response.json()) as { messages: MailpitSummary[] };
  return messages.filter((m) => m.To.some((r) => r.Address === to) && new Date(m.Created) >= since);
};

/** Waits for the reset email to `to` received after `since` and returns its content. */
const waitForResetEmail = async (to: string, since: Date): Promise<MailpitMessage> => {
  let found: MailpitSummary | undefined;
  await expect
    .poll(async () => {
      found = (await emailsTo(to, since)).find((m) => m.Subject === RESET_SUBJECT);
      return found !== undefined;
    }, { message: `reset email to ${to}`, timeout: 10_000 })
    .toBe(true);
  const mailpit = await newApi();
  return (await (await mailpit.get(`${MAILPIT_API}/message/${found!.ID}`)).json()) as MailpitMessage;
};

/** Polls Mailpit for NO_EMAIL_WINDOW_MS: no email to `to` received since `since` may appear. */
const expectNoEmailDuringWindow = async (to: string, since: Date) => {
  const end = Date.now() + NO_EMAIL_WINDOW_MS;
  do {
    expect(await emailsTo(to, since), `emails to ${to}`).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, MAILPIT_POLL_INTERVAL_MS));
  } while (Date.now() < end);
  expect(await emailsTo(to, since), `emails to ${to}`).toEqual([]);
};

const resetLinkOf = (message: MailpitMessage): string => {
  const match = /http:\/\/localhost:5173\/reset-password\?token=[A-Za-z0-9_-]+/.exec(message.Text);
  expect(match, 'reset link in the email').not.toBeNull();
  return match![0];
};

const requestResetInBrowser = async (page: Page, email: string) => {
  await page.locator('#forgot-email').fill(email);
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  return page.getByRole('status');
};

const fillResetPassword = async (page: Page, password: string) => {
  await page.locator('#reset-new-password').fill(password);
  await page.locator('#reset-confirm-password').fill(password);
  await page.getByRole('button', { name: 'Save new password' }).click();
};

test.describe('First login after employee registration (MH-171)', () => {
  test('an employee books for a new full hiker and sees the initial password', async ({ page }) => {
    // PO: the password is randomly generated and told to the hiker, e.g. verbally
    const date = ownDay();
    await ensureSlot(date, '12:00');
    const name = 'Nina Desk';
    const email = uniqueEmail();

    await signIn(page, EMPLOYEE, PASSWORD);
    await page.getByRole('navigation', { name: 'Staff' }).getByRole('link', { name: 'Reserve for a hiker' }).click();
    await expect(page.getByRole('heading', { name: 'Reserve for a hiker' })).toBeVisible();
    await page.getByLabel('Day', { exact: true }).fill(date);
    await page.getByRole('radiogroup', { name: 'Service' }).getByRole('radio', { name: /^12:00/ }).click();
    await page.getByRole('group', { name: 'Quick party size' }).getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('tab', { name: 'New account' }).click();
    await page.getByLabel('Full name', { exact: true }).fill(name);
    await page.getByLabel('Mobile number', { exact: true }).fill('+39 333 123 4567');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Reserve table' }).click();

    await expect(page.getByRole('heading', { name: 'Reservation made' })).toBeVisible();
    const box = page.getByRole('status').filter({ hasText: 'Initial password' });
    await expect(box).toContainText('they must change it at the first login');
    const password = box.locator('code');
    await expect(password).toHaveText(/\S+/);

    const hiker = await newApi();
    const session = await apiLogin(hiker, email, await password.innerText());
    expect(session).toMatchObject({ email, role: 'hiker', must_change_password: true });
  });

  test('the new hiker logs in and cannot use other pages until the password is changed', async ({ page }) => {
    // PO: the hiker is forced to change the password at the next login
    const hiker = await createHikerByStaff('13:00');

    await signIn(page, hiker.email, hiker.initialPassword);
    await expectOnChangePasswordPage(page);

    for (const path of ['/book-table', '/my-bookings', '/staff/reserve']) {
      await page.goto(path);
      await expectOnChangePasswordPage(page);
    }
    await page.getByRole('banner').getByRole('link', { name: 'Book a Table' }).first().click();
    await expectOnChangePasswordPage(page);
    await page.reload();
    await expectOnChangePasswordPage(page);
  });

  test('after the change the hiker lands on the booking page and can book', async ({ page }) => {
    // PO: the hiker chooses a password and then uses the site normally; the initial password stops working
    const hiker = await createHikerByStaff('14:00');
    await ensureSlot(ownDay(1), '13:00');
    await signIn(page, hiker.email, hiker.initialPassword);
    await expectOnChangePasswordPage(page);

    await fillChangePassword(page, hiker.initialPassword, NEW_PASSWORD);

    await expect(page).toHaveURL(/\/book-table$/);
    await pickDay(page, ownDayOffset(1));
    await page.getByRole('button', { name: /^13:00/ }).click();
    await page.getByRole('button', { name: 'Book Table' }).click();
    await expect(page.getByText(/Booking #\d+ confirmed/)).toBeVisible();
    const bookings = await page.request.get(`${API}/reservations`);
    expect(bookings.status()).toBe(200);
    expect(await bookings.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: ownDay(1), slot: '13:00' }),
    ]));

    expect((await page.request.delete(`${API}/session/current`)).status()).toBe(204);
    await signIn(page, hiker.email, hiker.initialPassword);
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');
    await signIn(page, hiker.email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/book-table$/);
  });

  test('a wrong current password and a too-short new password show an error', async ({ page }) => {
    // api.md: 401 for a wrong current password, 400 for a new password shorter than 8 characters
    const hiker = await createHikerByStaff('15:00');
    await signIn(page, hiker.email, hiker.initialPassword);
    await expectOnChangePasswordPage(page);

    await fillChangePassword(page, 'not the one I was told', NEW_PASSWORD);
    await expect(page.locator('#current-password-error')).toHaveText('This is not the password you were given.');
    await expectOnChangePasswordPage(page);

    await fillChangePassword(page, hiker.initialPassword, '1234567');
    await expect(page.locator('#new-password-error')).toHaveText('Use at least 8 characters.');
    await expectOnChangePasswordPage(page);

    await page.goto('/book-table');
    await expectOnChangePasswordPage(page);
  });

  test('a hiker who forgot the password gets an email whose link sets a new one, once', async ({ page }) => {
    // PO: in any case the hiker can recover the password via email; api.md: the link works only once
    const hiker = await createHikerByStaff('16:00');
    const since = new Date(Date.now() - 1000);

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    const status = await requestResetInBrowser(page, hiker.email);
    await expect(status).toContainText('The link works for 24 hours.');

    const email = await waitForResetEmail(hiker.email, since);
    expect(email.Text).toMatch(/24 hours/);
    const link = resetLinkOf(email);
    expect(link.startsWith(`${APP_ORIGIN}/reset-password?token=`)).toBe(true);

    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await fillResetPassword(page, NEW_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();

    // The reset also replaces the initial password: no forced change any more
    await page.getByRole('link', { name: 'Sign in' }).click();
    await page.locator('#login-email').fill(hiker.email);
    await page.locator('#login-password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/book-table$/);

    await page.goto(link);
    await fillResetPassword(page, 'yet another secret 44');
    await expect(page.getByRole('heading', { name: 'This link does not work' })).toBeVisible();
  });

  test('the forgot-password page answers the same for an unknown address and sends nothing', async ({ page }) => {
    // api.md: 202 always, the endpoint does not reveal which addresses have an account
    const hiker = await createHikerByStaff('17:00');
    const unknown = `nobody.${uniqueEmail()}`;
    const since = new Date(Date.now() - 1000);

    await page.goto('/forgot-password');
    const unknownText = await (await requestResetInBrowser(page, unknown)).innerText();
    await page.getByRole('button', { name: 'Use another email address' }).click();
    const knownText = await (await requestResetInBrowser(page, hiker.email)).innerText();

    expect(unknownText.replace(unknown, '<email>')).toBe(knownText.replace(hiker.email, '<email>'));
    await waitForResetEmail(hiker.email, since);
    await expectNoEmailDuringWindow(unknown, since);
  });
});
