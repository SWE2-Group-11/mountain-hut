import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// User story MH-08 - Cancel a booking.
// A hiker opens "My bookings", cancels one of their upcoming bookings after a confirmation, and the
// seats become free again. A cancellation is allowed at any time.
//
// The backend runs on one in-memory database for the whole run (see playwright.config.ts), so the
// specs share it. To stay independent, these tests work on their own day (today + 120), where every
// slot has T1 = 4 and T2 = 4 seats (8 in total) and each test books its own slot:
//   12:00  Mario: keep the booking, then cancel it so that Laura can book the seats
//   13:00  Mario: cancel, the seats are free again      14:00  Mario: cancelled elsewhere first
//   15:00  Mario: cancel when changes are closed        16:00  Mario: cancel after the slot has ended

const API = 'http://localhost:3000/api/v1';
const PASSWORD = 'password';
const MARIO = 'mario@mountainhut.test';
const LAURA = 'laura@mountainhut.test';
const WARDEN = 'warden@mountainhut.test';

/** YYYY-MM-DD of today + n days, in the local time zone (as the booking form sends it). */
const dayFromToday = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const OWN_DAY = dayFromToday(120);
const SLOTS = [
  ['12:00', '13:00'],
  ['13:00', '14:00'],
  ['14:00', '15:00'],
  ['15:00', '16:00'],
  ['16:00', '17:00'],
] as const;

type PublicSlot = { start_time: string; total_seats: number; available_seats: number };
type Booking = { id: number; date: string; slot: string; partySize: number };

/** "MH-000042" from the booking ID, as the page shows it. */
const referenceOf = (bookingId: number) => `MH-${String(bookingId).padStart(6, '0')}`;

/** Logs in a separate API session (no browser), used only to prepare and check the test data. */
const apiLogin = async (api: APIRequestContext, email: string) => {
  const response = await api.post(`${API}/session`, { data: { email, password: PASSWORD } });
  expect(response.ok(), `login as ${email}`).toBeTruthy();
};

/** The slots of a day as everyone sees them (public endpoint). A fully booked slot is not listed. */
const slotsOf = async (api: APIRequestContext, date: string): Promise<PublicSlot[]> => {
  const response = await api.get(`${API}/slots?date=${date}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
};

const freeSeats = async (api: APIRequestContext, slot: string): Promise<number | undefined> =>
  (await slotsOf(api, OWN_DAY)).find((s) => s.start_time === slot)?.available_seats;

/** The bookings of the logged-in hiker. */
const bookingsOf = async (api: APIRequestContext): Promise<Booking[]> => {
  const response = await api.get(`${API}/reservations`);
  expect(response.ok()).toBeTruthy();
  return response.json();
};

/**
 * The booking the hiker has in a slot of OWN_DAY: made now, or found again when a retried test
 * runs on the same database (a hiker can book a slot only once).
 */
const ensureBooking = async (api: APIRequestContext, slot: string, partySize: number): Promise<number> => {
  const existing = (await bookingsOf(api)).find((b) => b.date === OWN_DAY && b.slot === slot);
  if (existing) return existing.id;
  const created = await api.post(`${API}/reservations`, { data: { date: OWN_DAY, slot, partySize } });
  expect(created.status()).toBe(201);
  return (await created.json()).id;
};

/** Logs in through the login page, like a user. */
const login = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
};

/** Opens "My bookings" and returns the card of one booking. */
const openCard = async (page: Page, bookingId: number) => {
  await page.goto('/my-bookings');
  const card = page.getByRole('listitem').filter({ hasText: `Booking ${referenceOf(bookingId)}` });
  await expect(card).toBeVisible();
  return card;
};

const confirmation = (page: Page) => page.getByRole('alertdialog', { name: 'Cancel this booking' });

// Prepares OWN_DAY once. A retried test (CI retries once, on the same database) does not create the slots twice.
test.beforeAll(async ({ playwright }) => {
  const warden = await playwright.request.newContext();
  try {
    await apiLogin(warden, WARDEN);
    const existing = (await slotsOf(warden, OWN_DAY)).map((s) => s.start_time);
    for (const [startTime, endTime] of SLOTS) {
      if (existing.includes(startTime)) continue;
      const created = await warden.post(`${API}/slots`, {
        data: {
          date: OWN_DAY,
          startTime,
          endTime,
          tables: [
            { tableNumber: 1, seats: 4 },
            { tableNumber: 2, seats: 4 },
          ],
        },
      });
      expect(created.status()).toBe(201);
    }
  } finally {
    await warden.dispose();
  }
});

test.describe('Cancel a booking', () => {
  test('a visitor who is not logged in cannot open My bookings', async ({ page }) => {
    await page.goto('/my-bookings');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('Keep booking closes the question and cancels nothing', async ({ page, playwright }) => {
    const hiker = await playwright.request.newContext();
    try {
      await apiLogin(hiker, MARIO);
      const id = await ensureBooking(hiker, '12:00', 3);
      await login(page, MARIO);
      const card = await openCard(page, id);

      await card.getByRole('button', { name: 'Cancel booking' }).click();
      await expect(confirmation(page)).toBeVisible();
      await expect(confirmation(page).getByRole('button', { name: 'Keep booking' })).toBeFocused();
      await confirmation(page).getByRole('button', { name: 'Keep booking' }).click();

      await expect(confirmation(page)).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Cancel booking' })).toBeVisible();
      await expect(card.getByText('Cancelled', { exact: true })).toHaveCount(0);
      expect((await bookingsOf(hiker)).map((b) => b.id)).toContain(id);
      expect(await freeSeats(hiker, '12:00')).toBe(5);
    } finally {
      await hiker.dispose();
    }
  });

  test('cancelling marks the booking, frees the seats and the booking is gone after a reload', async ({
    page,
    playwright,
  }) => {
    const hiker = await playwright.request.newContext();
    try {
      await apiLogin(hiker, MARIO);
      const id = await ensureBooking(hiker, '13:00', 2);
      expect(await freeSeats(hiker, '13:00')).toBe(6);
      await login(page, MARIO);
      const card = await openCard(page, id);

      await card.getByRole('button', { name: 'Cancel booking' }).click();
      await expect(confirmation(page)).toContainText('Cancel this booking?');
      await confirmation(page).getByRole('button', { name: 'Yes, cancel booking' }).click();

      // The pop-up confirms, and the card stays on the page, marked as cancelled, with no buttons left
      await expect(page.getByRole('status').filter({ hasText: 'Booking cancelled' })).toBeVisible();
      await expect(card.getByText('Cancelled', { exact: true })).toBeVisible();
      await expect(card.getByText('This booking was cancelled. The places are free again.')).toBeVisible();
      await expect(card.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Change booking' })).toHaveCount(0);

      // The seats are free again, for everybody
      expect(await bookingsOf(hiker)).not.toContainEqual(expect.objectContaining({ id }));
      expect(await freeSeats(hiker, '13:00')).toBe(8);

      // After a reload the booking is no longer listed
      await page.reload();
      await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible();
      await expect(page.getByText(`Booking ${referenceOf(id)}`)).toHaveCount(0);
    } finally {
      await hiker.dispose();
    }
  });

  test('a booking already cancelled in another window is reported as such', async ({ page, playwright }) => {
    const hiker = await playwright.request.newContext();
    try {
      await apiLogin(hiker, MARIO);
      const id = await ensureBooking(hiker, '14:00', 2);
      await login(page, MARIO);
      const card = await openCard(page, id);

      // Meanwhile, the same booking is cancelled elsewhere (another tab, another device)
      const other = await hiker.delete(`${API}/reservations/${id}`);
      expect(other.status()).toBe(204);

      await card.getByRole('button', { name: 'Cancel booking' }).click();
      await confirmation(page).getByRole('button', { name: 'Yes, cancel booking' }).click();

      await expect(page.getByRole('status').filter({ hasText: 'Booking already cancelled' })).toBeVisible();
      await expect(card.getByText('Cancelled', { exact: true })).toBeVisible();
    } finally {
      await hiker.dispose();
    }
  });

  test('another hiker can book the seats freed by a cancellation', async ({ page, playwright }) => {
    // Mario holds 3 of the 8 seats of 12:00 (kept by the test above, or booked again if this runs alone)
    const mario = await playwright.request.newContext();
    const laura = await playwright.request.newContext();
    try {
      await apiLogin(mario, MARIO);
      await apiLogin(laura, LAURA);
      const id = await ensureBooking(mario, '12:00', 3);
      const tooBig = await laura.post(`${API}/reservations`, { data: { date: OWN_DAY, slot: '12:00', partySize: 8 } });
      expect(tooBig.status()).toBe(409);

      await login(page, MARIO);
      const card = await openCard(page, id);
      await card.getByRole('button', { name: 'Cancel booking' }).click();
      await confirmation(page).getByRole('button', { name: 'Yes, cancel booking' }).click();
      await expect(card.getByText('Cancelled', { exact: true })).toBeVisible();

      const booked = await laura.post(`${API}/reservations`, { data: { date: OWN_DAY, slot: '12:00', partySize: 8 } });
      expect(booked.status()).toBe(201);
    } finally {
      await mario.dispose();
      await laura.dispose();
    }
  });

  // A cancellation has no time limit. The browser clock is moved (only the clock of the page: the
  // server keeps the real one, and it accepts a cancellation at any time anyway).
  test.describe('there is no time limit', () => {
    const at = (utcTime: string) => new Date(`${OWN_DAY}T${utcTime}:00Z`);

    test('cancelling is still possible when changes are already closed', async ({ page, playwright }) => {
      const hiker = await playwright.request.newContext();
      try {
        await apiLogin(hiker, MARIO);
        const id = await ensureBooking(hiker, '15:00', 2);
        await login(page, MARIO);
        // 06:00 UTC is 07:00 or 08:00 in the hut, hours before the 15:00 slot
        await page.clock.setFixedTime(at('06:00'));
        const card = await openCard(page, id);

        await expect(card.getByRole('button', { name: 'Change booking' })).toBeDisabled();
        await expect(card.getByText(/can no longer be changed/)).toBeVisible();
        await card.getByRole('button', { name: 'Cancel booking' }).click();
        await confirmation(page).getByRole('button', { name: 'Yes, cancel booking' }).click();

        await expect(page.getByRole('status').filter({ hasText: 'Booking cancelled' })).toBeVisible();
        await expect(card.getByText('Cancelled', { exact: true })).toBeVisible();
        expect(await freeSeats(hiker, '15:00')).toBe(8);
      } finally {
        await hiker.dispose();
      }
    });

    test('cancelling is possible even after the slot has ended', async ({ page, playwright }) => {
      const hiker = await playwright.request.newContext();
      try {
        await apiLogin(hiker, MARIO);
        const id = await ensureBooking(hiker, '16:00', 2);
        await login(page, MARIO);
        // 20:00 UTC is 21:00 or 22:00 in the hut, after the 16:00 - 17:00 slot
        await page.clock.setFixedTime(at('20:00'));
        const card = await openCard(page, id);

        await expect(card.getByRole('button', { name: 'Change booking' })).toBeDisabled();
        await card.getByRole('button', { name: 'Cancel booking' }).click();
        await confirmation(page).getByRole('button', { name: 'Yes, cancel booking' }).click();

        await expect(card.getByText('Cancelled', { exact: true })).toBeVisible();
        expect(await freeSeats(hiker, '16:00')).toBe(8);
      } finally {
        await hiker.dispose();
      }
    });
  });
});