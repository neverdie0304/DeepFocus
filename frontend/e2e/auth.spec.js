/**
 * E2E tests for authentication flows: signup, login, logout.
 */
import { test, expect } from '@playwright/test';

function uniqueUsername() {
  return `e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

test.describe('Authentication', () => {
  test('landing page shows Get Started for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /get started/i })).toBeVisible();
  });

  test('signup creates a new account and redirects to dashboard', async ({ page }) => {
    const username = uniqueUsername();
    await page.goto('/signup');

    await page.getByPlaceholder(/username/i).fill(username);
    await page.getByPlaceholder(/email/i).fill(`${username}@test.com`);
    await page.getByPlaceholder(/password/i).fill('testpassword123');
    await page.getByRole('button', { name: /sign up/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('login with wrong credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/username/i).fill('nonexistent_user_xyz');
    await page.getByPlaceholder(/password/i).fill('wrong_password');
    await page.getByRole('button', { name: /login/i }).click();

    // Should stay on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('protected route redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout returns user to landing page', async ({ page }) => {
    // First sign up
    const username = uniqueUsername();
    await page.goto('/signup');
    await page.getByPlaceholder(/username/i).fill(username);
    await page.getByPlaceholder(/email/i).fill(`${username}@test.com`);
    await page.getByPlaceholder(/password/i).fill('testpassword123');
    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Then logout
    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
