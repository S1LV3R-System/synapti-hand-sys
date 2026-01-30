import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should redirect to login page', async ({ page }) => {
    await expect(page).toHaveURL(/.*login/);
    await expect(page.locator('h1')).toContainText(/SynaptiHand/i);
  });

  test('should display login form', async ({ page }) => {
    await page.goto('/login');

    // Check for email input
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput).toBeVisible();

    // Check for password input
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    await expect(passwordInput).toBeVisible();

    // Check for login button
    const loginButton = page.locator('button[type="submit"], button:has-text("login"), button:has-text("sign in")');
    await expect(loginButton).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill in invalid credentials
    await page.fill('input[type="email"], input[name="email"]', 'invalid@example.com');
    await page.fill('input[type="password"], input[name="password"]', 'wrongpassword');

    // Click login button
    await page.click('button[type="submit"], button:has-text("login"), button:has-text("sign in")');

    // Wait for error message
    await page.waitForTimeout(1000);

    // Should still be on login page or show error
    const url = page.url();
    const hasError = await page.locator('text=/error|invalid|incorrect|failed/i').count() > 0;

    expect(url.includes('/login') || hasError).toBeTruthy();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill in valid credentials
    await page.fill('input[type="email"], input[name="email"]', 'admin@synaptihand.com');
    await page.fill('input[type="password"], input[name="password"]', 'Admin123!@');

    // Click login button
    await page.click('button[type="submit"], button:has-text("login"), button:has-text("sign in")');

    // Wait for navigation
    await page.waitForTimeout(2000);

    // Should redirect away from login page
    await expect(page).not.toHaveURL(/.*login/);
  });

  test('should access home page after login', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', 'admin@synaptihand.com');
    await page.fill('input[type="password"], input[name="password"]', 'Admin123!@');
    await page.click('button[type="submit"], button:has-text("login"), button:has-text("sign in")');

    // Wait for redirect
    await page.waitForTimeout(2000);

    // Navigate to home
    await page.goto('/home');

    // Should be on home page
    await expect(page).toHaveURL(/.*home/);
  });
});
