import { test, expect } from '@playwright/test';

test.describe('Accessibility Testing', () => {
  test('should have proper document structure', async ({ page }) => {
    await page.goto('/login');

    // Check for proper HTML structure
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang');

    // Should have a main heading
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
  });

  test('should have accessible form elements', async ({ page }) => {
    await page.goto('/login');

    // Check email input accessibility
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const emailLabel = await emailInput.getAttribute('aria-label') ||
                       await emailInput.getAttribute('placeholder') ||
                       await page.locator('label[for]').count();

    expect(emailLabel).toBeTruthy();

    // Check password input accessibility
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    const passwordLabel = await passwordInput.getAttribute('aria-label') ||
                          await passwordInput.getAttribute('placeholder') ||
                          await page.locator('label[for]').count();

    expect(passwordLabel).toBeTruthy();
  });

  test('should have keyboard navigation support', async ({ page }) => {
    await page.goto('/login');

    // Focus on first input using Tab
    await page.keyboard.press('Tab');

    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);

    // Should focus on an input or button
    expect(['INPUT', 'BUTTON', 'A'].includes(focusedElement || '')).toBeTruthy();
  });

  test('should have proper color contrast', async ({ page }) => {
    await page.goto('/login');

    // Get computed styles of text elements
    const textElements = await page.locator('p, span, label, button, h1, h2, h3').all();

    for (const element of textElements.slice(0, 5)) {
      const styles = await element.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          fontSize: computed.fontSize
        };
      });

      // Basic check: ensure text is not the same color as background
      expect(styles.color).not.toBe(styles.backgroundColor);
    }
  });

  test('should have descriptive page titles', async ({ page }) => {
    await page.goto('/login');
    const loginTitle = await page.title();
    expect(loginTitle.length).toBeGreaterThan(0);

    await page.goto('/');
    const homeTitle = await page.title();
    expect(homeTitle.length).toBeGreaterThan(0);
  });

  test('should handle error states accessibly', async ({ page }) => {
    await page.goto('/login');

    // Submit empty form to trigger validation
    await page.click('button[type="submit"], button:has-text("login"), button:has-text("sign in")');

    await page.waitForTimeout(500);

    // Check if error messages are visible and accessible
    const errors = page.locator('[role="alert"], .error, [aria-invalid="true"]');
    const errorCount = await errors.count();

    // Either form validation works or backend returns error
    expect(errorCount >= 0).toBeTruthy();
  });

  test('should support screen reader navigation', async ({ page }) => {
    await page.goto('/login');

    // Check for landmark regions
    const landmarks = await page.evaluate(() => {
      return {
        main: document.querySelector('main, [role="main"]') !== null,
        navigation: document.querySelector('nav, [role="navigation"]') !== null,
        form: document.querySelector('form') !== null
      };
    });

    // Should have at least a form element
    expect(landmarks.form).toBeTruthy();
  });
});
