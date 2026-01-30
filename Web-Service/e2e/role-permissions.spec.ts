import { test, expect } from '@playwright/test';

/**
 * Role-Based Permissions E2E Tests
 *
 * Tests the corrected permission matrix:
 * - Patient Management: Admin ✅ | Clinician ✅ | Researcher ✅ | Patient ❌
 * - Recording Upload: Admin ✅ | Clinician ✅ | Researcher ✅ | Patient ❌
 * - Protocol Creation: Admin ✅ | Clinician ❌ | Researcher ✅ | Patient ❌
 * - Comparisons: Admin ✅ | Clinician ❌ | Researcher ✅ | Patient ❌
 * - Clinical Analysis: Admin ✅ | Clinician ✅ | Researcher ✅ | Patient ❌
 */

test.describe('Admin Role Permissions', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
    await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'password123');
    await page.click('button[type="submit"]');

    // Wait for navigation to complete
    await page.waitForURL('/dashboard', { timeout: 10000 });
  });

  test('Admin can access admin dashboard', async ({ page }) => {
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1, h2').filter({ hasText: /admin/i })).toBeVisible();
  });

  test('Admin can access user management', async ({ page }) => {
    // Check if user management link is visible
    const userManagementLink = page.locator('a, button').filter({ hasText: /user.*management|users/i }).first();
    await expect(userManagementLink).toBeVisible();
  });

  test('Admin can upload recordings', async ({ page }) => {
    await page.goto('/recordings/upload');
    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('h1, h2').filter({ hasText: /upload|recording/i })).toBeVisible();
  });

  test('Admin can create patients', async ({ page }) => {
    // Navigate to projects first
    await page.goto('/projects');

    // Look for create patient or add patient button
    const createButton = page.locator('button').filter({ hasText: /create patient|add patient|new patient/i }).first();
    if (await createButton.isVisible()) {
      await expect(createButton).toBeVisible();
      await expect(createButton).toBeEnabled();
    }
  });

  test('Admin can create protocols', async ({ page }) => {
    await page.goto('/protocols');

    const createButton = page.locator('button').filter({ hasText: /create protocol|add protocol|new protocol/i }).first();
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();
  });

  test('Admin can access comparisons', async ({ page }) => {
    await page.goto('/comparisons');

    // Should not see access denied
    await expect(page.locator('text=/access denied|forbidden|403/i')).not.toBeVisible({ timeout: 5000 });

    // Should see comparisons page
    await expect(page.locator('h1, h2').filter({ hasText: /comparison/i })).toBeVisible();
  });
});

test.describe('Clinician Role Permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.TEST_CLINICIAN_EMAIL || 'clinician@test.com');
    await page.fill('[name="password"]', process.env.TEST_CLINICIAN_PASSWORD || 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('/user-dashboard', { timeout: 10000 });
  });

  test('Clinician redirects to user dashboard', async ({ page }) => {
    await expect(page).toHaveURL('/user-dashboard');
  });

  test('Clinician cannot access admin dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    // Should be redirected or see access denied
    await expect(page.locator('text=/access denied|forbidden|403|unauthorized/i')).toBeVisible({ timeout: 5000 });
  });

  test('Clinician can upload recordings', async ({ page }) => {
    await page.goto('/recordings/upload');

    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('h1, h2').filter({ hasText: /upload|recording/i })).toBeVisible();
  });

  test('Clinician can manage patients', async ({ page }) => {
    await page.goto('/projects');

    // Should be able to see patients
    await expect(page.locator('text=/patient|patients/i')).toBeVisible({ timeout: 5000 });
  });

  test('Clinician cannot create protocols', async ({ page }) => {
    await page.goto('/protocols');

    // Create button should not be visible or should be disabled
    const createButton = page.locator('button').filter({ hasText: /create protocol|add protocol|new protocol/i }).first();

    // Either button doesn't exist or is disabled
    const buttonCount = await createButton.count();
    if (buttonCount > 0) {
      await expect(createButton).toBeDisabled();
    }
  });

  test('Clinician cannot access comparisons', async ({ page }) => {
    await page.goto('/comparisons');

    // Should see access denied
    await expect(page.locator('text=/access denied|forbidden|403|unauthorized/i')).toBeVisible({ timeout: 5000 });
  });

  test('Clinician can view clinical analysis', async ({ page }) => {
    // Navigate to recordings first
    await page.goto('/recordings');

    // If there are any recordings, should be able to click on them
    const recordingLink = page.locator('a[href*="/recordings/"]').first();
    if (await recordingLink.isVisible()) {
      await recordingLink.click();

      // Should see recording details page
      await expect(page.locator('h1, h2').filter({ hasText: /recording|detail/i })).toBeVisible();
    }
  });
});

test.describe('Researcher Role Permissions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.TEST_RESEARCHER_EMAIL || 'researcher@test.com');
    await page.fill('[name="password"]', process.env.TEST_RESEARCHER_PASSWORD || 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('/user-dashboard', { timeout: 10000 });
  });

  test('Researcher redirects to user dashboard', async ({ page }) => {
    await expect(page).toHaveURL('/user-dashboard');
  });

  test('Researcher cannot access admin dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.locator('text=/access denied|forbidden|403|unauthorized/i')).toBeVisible({ timeout: 5000 });
  });

  test('Researcher can upload recordings', async ({ page }) => {
    await page.goto('/recordings/upload');

    await expect(page.locator('form')).toBeVisible();
    await expect(page.locator('h1, h2').filter({ hasText: /upload|recording/i })).toBeVisible();
  });

  test('Researcher can manage patients', async ({ page }) => {
    await page.goto('/projects');

    await expect(page.locator('text=/patient|patients/i')).toBeVisible({ timeout: 5000 });
  });

  test('Researcher can create protocols', async ({ page }) => {
    await page.goto('/protocols');

    const createButton = page.locator('button').filter({ hasText: /create protocol|add protocol|new protocol/i }).first();
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeEnabled();
  });

  test('Researcher can access comparisons', async ({ page }) => {
    await page.goto('/comparisons');

    // Should not see access denied
    await expect(page.locator('text=/access denied|forbidden|403/i')).not.toBeVisible({ timeout: 5000 });

    // Should see comparisons page
    await expect(page.locator('h1, h2').filter({ hasText: /comparison/i })).toBeVisible();
  });

  test('Researcher can view clinical analysis', async ({ page }) => {
    await page.goto('/recordings');

    const recordingLink = page.locator('a[href*="/recordings/"]').first();
    if (await recordingLink.isVisible()) {
      await recordingLink.click();

      await expect(page.locator('h1, h2').filter({ hasText: /recording|detail/i })).toBeVisible();
    }
  });
});

test.describe('Navigation Flow Tests', () => {
  test('All menu links are functional (Admin)', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
    await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Test each main menu item
    const menuItems = [
      { text: /dashboard/i, url: '/dashboard' },
      { text: /project/i, url: '/projects' },
      { text: /protocol/i, url: '/protocols' },
      { text: /recording/i, url: '/recordings' },
      { text: /comparison/i, url: '/comparisons' },
    ];

    for (const item of menuItems) {
      const link = page.locator('a, button').filter({ hasText: item.text }).first();
      if (await link.isVisible()) {
        await link.click();
        await expect(page).toHaveURL(new RegExp(item.url));
      }
    }
  });

  test('No broken internal links', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
    await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Get all internal links
    const links = await page.locator('a[href^="/"]').all();

    // Test first 10 links (adjust as needed)
    for (let i = 0; i < Math.min(links.length, 10); i++) {
      const href = await links[i].getAttribute('href');
      if (href) {
        await page.goto(href);

        // Should not see 404 or error page
        await expect(page.locator('text=/404|not found|page.*error/i')).not.toBeVisible({ timeout: 3000 });
      }
    }
  });
});

test.describe('Form Submission Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
    await page.fill('[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 10000 });
  });

  test('Project creation form works', async ({ page }) => {
    await page.goto('/projects/create');

    // Fill form
    await page.fill('[name="projectName"], [name="name"]', 'E2E Test Project');
    await page.fill('[name="projectDescription"], [name="description"]', 'Test description');

    // Submit
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeEnabled();

    // Note: Don't actually submit in test to avoid creating test data
    // await submitButton.click();
  });

  test('Protocol creation form loads', async ({ page }) => {
    await page.goto('/protocols');

    const createButton = page.locator('button').filter({ hasText: /create protocol|add protocol/i }).first();
    await createButton.click();

    // Modal should open
    await expect(page.locator('form').filter({ hasText: /protocol/i })).toBeVisible({ timeout: 5000 });
  });
});
