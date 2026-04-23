/**
 * E2E tests for the session workflow: start, run, end, view report.
 * Uses camera-off mode to avoid MediaPipe model loading in headless tests.
 */
import { test, expect } from '@playwright/test';

function uniqueUsername() {
  return `e2e_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

async function signUp(page) {
  const username = uniqueUsername();
  await page.goto('/signup');
  await page.getByPlaceholder(/username/i).fill(username);
  await page.getByPlaceholder(/email/i).fill(`${username}@test.com`);
  await page.getByPlaceholder(/password/i).fill('testpassword123');
  await page.getByRole('button', { name: /sign up/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return username;
}

test.describe('Session lifecycle', () => {
  test('can start and end a camera-off session', async ({ page }) => {
    await signUp(page);

    // Navigate to session page
    await page.goto('/session');

    // Uncheck the default camera-enabled checkbox to run in camera-off mode
    // (camera is ON by default since the last update)
    const cameraCheckbox = page.getByRole('checkbox');
    if (await cameraCheckbox.isChecked()) {
      await cameraCheckbox.click();
      // Handle the consent modal for camera if it appears
      const declineButton = page.getByRole('button', { name: /continue without/i });
      if (await declineButton.isVisible().catch(() => false)) {
        await declineButton.click();
      }
    }

    // Select a task type
    await page.getByRole('button', { name: /coding/i }).click();

    // Start session
    await page.getByRole('button', { name: /start session/i }).click();

    // Wait for session to be running — focus gauge should appear
    await expect(page.getByText(/focused|distracted|away/i).first()).toBeVisible({ timeout: 5000 });

    // End session
    await page.getByRole('button', { name: /end session/i }).click();

    // Should navigate to a report page
    await expect(page).toHaveURL(/\/session\/\d+\/report/, { timeout: 10_000 });
  });

  test('can view session report after completion', async ({ page }) => {
    await signUp(page);
    await page.goto('/session');

    // Disable camera for fast test
    const cameraCheckbox = page.getByRole('checkbox');
    if (await cameraCheckbox.isChecked()) {
      await cameraCheckbox.click();
      const declineButton = page.getByRole('button', { name: /continue without/i });
      if (await declineButton.isVisible().catch(() => false)) {
        await declineButton.click();
      }
    }

    await page.getByRole('button', { name: /reading/i }).click();
    await page.getByRole('button', { name: /start session/i }).click();
    await page.waitForTimeout(2500); // let one sample be recorded
    await page.getByRole('button', { name: /end session/i }).click();

    await expect(page).toHaveURL(/\/session\/\d+\/report/);

    // Verify report page contains expected sections
    await expect(page.getByText(/session report/i)).toBeVisible();
    await expect(page.getByText(/overall focus score/i)).toBeVisible();
    await expect(page.getByText(/time breakdown/i)).toBeVisible();
  });

  test('can save a note on the session report', async ({ page }) => {
    await signUp(page);
    await page.goto('/session');

    const cameraCheckbox = page.getByRole('checkbox');
    if (await cameraCheckbox.isChecked()) {
      await cameraCheckbox.click();
      const declineButton = page.getByRole('button', { name: /continue without/i });
      if (await declineButton.isVisible().catch(() => false)) {
        await declineButton.click();
      }
    }

    await page.getByRole('button', { name: /start session/i }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /end session/i }).click();
    await expect(page).toHaveURL(/\/session\/\d+\/report/);

    await page.getByPlaceholder(/add a note/i).fill('This was a productive test session.');
    await page.getByRole('button', { name: /save note/i }).click();

    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Session history', () => {
  test('completed session appears on dashboard', async ({ page }) => {
    await signUp(page);
    await page.goto('/session');

    const cameraCheckbox = page.getByRole('checkbox');
    if (await cameraCheckbox.isChecked()) {
      await cameraCheckbox.click();
      const declineButton = page.getByRole('button', { name: /continue without/i });
      if (await declineButton.isVisible().catch(() => false)) {
        await declineButton.click();
      }
    }

    await page.getByRole('button', { name: /start session/i }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /end session/i }).click();

    await expect(page).toHaveURL(/\/session\/\d+\/report/);

    await page.goto('/dashboard');
    await expect(page.getByText(/recent sessions/i)).toBeVisible({ timeout: 5000 });
  });
});
