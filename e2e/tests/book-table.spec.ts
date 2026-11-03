import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'password';
const MARIO = 'mario@mountainhut.test';
const EMPLOYEE = 'employee@mountainhut.test';

const login = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

const pickTomorrow = async (page: Page) => {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (tomorrow.getMonth() !== today.getMonth()) {
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  await page
    .getByRole('button', { name: String(tomorrow.getDate()), exact: true })
    .click();
};

test.describe('Book a table', () => {
  test('a visitor is sent to the login page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Book a Table' }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a hiker books a table and sees the confirmation', async ({ page }) => {
    await login(page, MARIO);
    await expect(page).toHaveURL(/\/book-table$/);
    await pickTomorrow(page);
    await page.getByRole('button', { name: /^13:00/ }).click();
    await page.getByRole('button', { name: 'Increase party size' }).click();
    await page.getByRole('button', { name: 'Book Table' }).click();
    await expect(page.getByText(/Booking #\d+ confirmed/)).toBeVisible();
  });

  test('the book button stays disabled until a time is chosen', async ({ page }) => {
    await login(page, MARIO);
    await expect(page.getByRole('button', { name: 'Book Table' })).toBeDisabled();
  });

  test('staff do not see the Book a Table link', async ({ page }) => {
    await login(page, EMPLOYEE);
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Book a Table' }),
    ).toHaveCount(0);
  });
});
