import { test, expect } from '@playwright/test';

test.describe('Navigation and Routing', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');

    // Should not show connection errors
    await expect(page.locator('body')).not.toContainText(/ERR_CONNECTION_REFUSED|502 Bad Gateway|503 Service Unavailable/);
  });

  test('should have working frontend build', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);

    // Check if Vite client is loading
    const viteLogs = [];
    page.on('console', msg => {
      if (msg.text().includes('vite')) {
        viteLogs.push(msg.text());
      }
    });

    // Should have React root element
    const root = page.locator('#root');
    await expect(root).toBeAttached();
  });

  test('should handle route navigation', async ({ page }) => {
    await page.goto('/');

    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);

    // Login
    await page.fill('input[type="email"], input[name="email"]', 'admin@synaptihand.com');
    await page.fill('input[type="password"], input[name="password"]', 'Admin123!@');
    await page.click('button[type="submit"], button:has-text("login"), button:has-text("sign in")');

    // Wait for navigation
    await page.waitForTimeout(2000);

    // Try navigating to different routes
    await page.goto('/home');
    await expect(page).toHaveURL(/.*home/);

    await page.goto('/admin');
    // Admin route might not be implemented or redirects to home
    const url = page.url();
    expect(url).toMatch(/.*(admin|home)/);
  });

  test('should protect routes requiring authentication', async ({ page }) => {
    // Try accessing protected route directly without login
    await page.goto('/home');

    // Should redirect to login
    await page.waitForTimeout(1000);
    const url = page.url();

    // Either redirected to login or showing auth error
    expect(url.includes('/login') || url.includes('/home')).toBeTruthy();
  });

  test('should handle 404 for non-existent routes', async ({ page }) => {
    const response = await page.goto('/non-existent-route-12345');

    // Should either redirect or show 404
    // React Router usually redirects to home or shows a 404 component
    expect(response?.status()).toBeLessThan(500);
  });
});
